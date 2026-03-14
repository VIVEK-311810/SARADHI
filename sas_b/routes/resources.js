const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const documentProcessor = require('../services/documentProcessor');
const embeddingService = require('../services/embeddingService');
const vectorStore = require('../services/vectorStore');
const summarizationService = require('../services/summarizationService');
const { authenticate, authorize } = require('../middleware/auth');
const pool = require('../db');
const logger = require('../logger');

const router = express.Router();

// Debug test endpoints removed — were unauthenticated and exposed internal DB/storage structure.

// Strict MIME-type → allowed extensions map; both must agree to prevent MIME spoofing
const MIME_TO_EXTENSIONS = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = MIME_TO_EXTENSIONS[file.mimetype];
    if (!allowedExtensions) {
      return cb(new Error('Invalid file type. Only PDF, Word, and PowerPoint files are allowed.'));
    }
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error(`File extension '.${ext}' does not match the declared content type.`));
    }
    cb(null, true);
  }
});

// POST /api/resources/upload - Upload file
router.post('/upload', authenticate, authorize('teacher'), upload.single('file'), async (req, res) => {
  try {
    const { session_id, title, description, is_downloadable } = req.body;
    const file = req.file;
    const teacher_id = req.user.id;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!session_id || !title) {
      return res.status(400).json({ error: 'Session ID and title are required' });
    }

    // Generate unique resource ID
    const resourceId = uuidv4();

    // Determine file type and storage path
    const fileExt = file.originalname.split('.').pop().toLowerCase();
    const resourceType = getResourceType(fileExt);
    const filePath = `${session_id}/${resourceType}s/${resourceId}.${fileExt}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('session-resources')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      logger.error('Supabase upload error', { error: uploadError.message });
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('session-resources')
      .getPublicUrl(filePath);

    // Save metadata to database
    const { data: resourceData, error: dbError } = await supabase
      .from('resources')
      .insert({
        id: resourceId,
        session_id,
        teacher_id,
        title,
        description: description || null,
        resource_type: resourceType,
        file_path: filePath,
        file_url: urlData.publicUrl,
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        is_downloadable: is_downloadable === 'true' || is_downloadable === true
      })
      .select()
      .single();

    if (dbError) {
      logger.error('Database error saving resource', { error: dbError.message });
      // Try to delete the uploaded file
      await supabase.storage.from('session-resources').remove([filePath]);
      return res.status(500).json({ error: 'Failed to save resource metadata' });
    }

    // Trigger async vectorization (don't wait)
    vectorizeResource(resourceId, session_id).catch(err => {
      logger.error('Vectorization error', { error: err.message, resourceId });
    });

    // Trigger async summarization (don't wait)
    summarizeResource(resourceId).catch(err => {
      logger.error('Summarization error', { error: err.message, resourceId });
    });

    res.json({
      success: true,
      resource: resourceData,
      message: 'File uploaded successfully. Processing in progress.'
    });

  } catch (error) {
    logger.error('Upload error', { error: error.message });
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /api/resources/add-url - Add URL resource (no vectorization)
router.post('/add-url', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id, title, description, url, is_downloadable } = req.body;

    if (!session_id || !title || !url) {
      return res.status(400).json({ error: 'Session ID, title, and URL are required' });
    }

    // Basic URL validation
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }

    // Generate unique resource ID
    const resourceId = uuidv4();

    // Insert data to be sent
    const insertData = {
      id: resourceId,
      session_id,
      teacher_id: req.user.id, // Always use authenticated user — prevents IDOR
      title,
      description: description || null,
      resource_type: 'url',
      file_path: url, // Store URL in file_path for consistency
      file_url: url,
      file_name: title,
      file_size: 0,
      mime_type: 'text/url',
      is_downloadable: is_downloadable === 'true' || is_downloadable === true,
      is_vectorized: false,
      vectorization_status: 'not_applicable'
    };

    // Save URL resource to database (no file upload, no vectorization)
    const { data: resourceData, error: dbError } = await supabase
      .from('resources')
      .insert(insertData)
      .select()
      .single();

    if (dbError) {
      logger.error('Failed to save URL resource', { error: dbError.message });
      return res.status(500).json({ error: 'Failed to save URL resource' });
    }

    res.json({
      success: true,
      resource: resourceData,
      message: 'URL resource added successfully'
    });

  } catch (error) {
    logger.error('Add URL error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/session/:sessionId - Get all resources for session
router.get('/session/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify user is the teacher of or enrolled in this session
    const memberCheck = await pool.query(
      `SELECT 1 FROM sessions s
       WHERE s.session_id = $1
         AND (s.teacher_id = $2
              OR EXISTS (SELECT 1 FROM session_participants sp
                         WHERE sp.session_id = s.id AND sp.student_id = $2))`,
      [sessionId.toUpperCase(), req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Database error fetching resources', { error: error.message });
      return res.status(500).json({ error: 'Failed to fetch resources' });
    }

    res.json({
      success: true,
      count: data.length,
      resources: data
    });

  } catch (error) {
    logger.error('Fetch resources error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/:resourceId - Get specific resource
router.get('/:resourceId', authenticate, async (req, res) => {
  try {
    const { resourceId } = req.params;

    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resourceId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Verify user is the teacher of or enrolled in this resource's session
    const memberCheck = await pool.query(
      `SELECT 1 FROM sessions s
       WHERE s.session_id = $1
         AND (s.teacher_id = $2
              OR EXISTS (SELECT 1 FROM session_participants sp
                         WHERE sp.session_id = s.id AND sp.student_id = $2))`,
      [data.session_id.toUpperCase(), req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ success: true, resource: data });

  } catch (error) {
    logger.error('Fetch resource error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resources/:resourceId - Delete resource
router.delete('/:resourceId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { resourceId } = req.params;
    const teacherId = req.user.id;

    // Get resource
    const { data: resource, error: fetchError } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resourceId)
      .eq('teacher_id', teacherId)
      .single();

    if (fetchError || !resource) {
      return res.status(404).json({ error: 'Resource not found or unauthorized' });
    }

    // Delete from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('session-resources')
      .remove([resource.file_path]);

    if (storageError) {
      logger.warn('Storage deletion error (file may not exist)', { error: storageError.message });
      // Continue anyway - file might not exist
    }

    // Delete vectors
    await vectorStore.deleteResource(resourceId);

    // Delete from database (cascades to chunks and logs)
    const { error: deleteError } = await supabase
      .from('resources')
      .delete()
      .eq('id', resourceId);

    if (deleteError) {
      logger.error('Database deletion error', { error: deleteError.message });
      return res.status(500).json({ error: 'Failed to delete resource' });
    }

    res.json({ success: true, message: 'Resource deleted successfully' });

  } catch (error) {
    logger.error('Delete resource error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources/:resourceId/track - Track view/download
router.post('/:resourceId/track', authenticate, async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { action } = req.body; // 'view' or 'download'
    const studentId = req.user.id;

    if (!['view', 'download'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "view" or "download"' });
    }

    // Verify user is enrolled in the resource's session before logging access
    const { data: resource, error: resErr } = await supabase
      .from('resources')
      .select('session_id')
      .eq('id', resourceId)
      .single();

    if (resErr || !resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const memberCheck = await pool.query(
      `SELECT 1 FROM sessions s
       WHERE s.session_id = $1
         AND (s.teacher_id = $2
              OR EXISTS (SELECT 1 FROM session_participants sp
                         WHERE sp.session_id = s.id AND sp.student_id = $2))`,
      [resource.session_id.toUpperCase(), req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Log access
    const { error: logError } = await supabase
      .from('resource_access_logs')
      .insert({
        resource_id: resourceId,
        student_id: studentId,
        action
      });

    if (logError) {
      logger.warn('Access log error', { error: logError.message });
    }

    // Increment counter
    const field = action === 'view' ? 'view_count' : 'download_count';

    const { error: updateError } = await supabase
      .from('resources')
      .update({ [field]: supabase.rpc('increment', { field_name: field }) })
      .eq('id', resourceId);

    if (updateError) {
      // If RPC doesn't exist, use manual increment
      const { data: resource } = await supabase
        .from('resources')
        .select(field)
        .eq('id', resourceId)
        .single();

      if (resource) {
        await supabase
          .from('resources')
          .update({ [field]: (resource[field] || 0) + 1 })
          .eq('id', resourceId);
      }
    }

    res.json({ success: true });

  } catch (error) {
    logger.error('Track access error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/:resourceId/vectorization-status - Get vectorization status
router.get('/:resourceId/vectorization-status', authenticate, async (req, res) => {
  try {
    const { resourceId } = req.params;

    const { data, error } = await supabase
      .from('resources')
      .select('is_vectorized, vectorization_status, chunk_count, last_vectorized_at')
      .eq('id', resourceId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    res.json({
      success: true,
      vectorization: data
    });

  } catch (error) {
    logger.error('Vectorization status error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
function getResourceType(fileExtension) {
  const typeMap = {
    'pdf': 'pdf',
    'doc': 'document',
    'docx': 'document',
    'ppt': 'presentation',
    'pptx': 'presentation',
    'xls': 'spreadsheet',
    'xlsx': 'spreadsheet'
  };

  return typeMap[fileExtension.toLowerCase()] || 'other';
}

async function vectorizeResource(resourceId, sessionId) {
  try {
    logger.info('Starting vectorization', { resourceId });

    // Update status
    await supabase
      .from('resources')
      .update({ vectorization_status: 'processing' })
      .eq('id', resourceId);

    // Get resource
    const { data: resource, error: fetchError } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resourceId)
      .single();

    if (fetchError || !resource) {
      throw new Error('Resource not found');
    }

    // For PowerPoint files, use description instead of text extraction
    let extracted;
    if (resource.resource_type === 'presentation') {
      logger.info('Using description for PowerPoint vectorization', { resourceId });

      if (!resource.description || resource.description.trim().length < 20) {
        throw new Error('PowerPoint files require a detailed description for vectorization');
      }

      extracted = {
        text: resource.description,
        pageCount: 1,
        pages: [resource.description]
      };

      logger.info('Using description for vectorization', { resourceId, chars: extracted.text.length });
    } else {
      // Extract text from PDF, Word, etc.
      logger.info('Extracting text from resource', { resourceId, type: resource.resource_type });
      extracted = await documentProcessor.extractText(
        resourceId,
        resource.file_path,
        resource.resource_type
      );

      if (!extracted.text || extracted.text.trim().length === 0) {
        throw new Error('No text extracted from document');
      }
    }

    // Chunk text using semantic chunking
    logger.info('Chunking text', { resourceId, chars: extracted.text.length });
    const chunks = documentProcessor.chunkText(extracted.text, {
      maxTokens: 400,
      overlapTokens: 50,
      pageCount: extracted.pageCount,
    });

    if (chunks.length === 0) {
      throw new Error('No chunks created from text');
    }

    // Generate embeddings
    logger.info('Generating embeddings', { resourceId, chunkCount: chunks.length });
    const texts = chunks.map(c => c.text);
    const embeddings = await embeddingService.generateBatchEmbeddings(texts);

    // Store in vector DB with denormalized resource metadata
    logger.info('Storing vectors in Pinecone', { resourceId });
    await vectorStore.upsertVectors(resourceId, sessionId, chunks, embeddings, {
      title: resource.title,
      fileName: resource.file_name,
      resourceType: resource.resource_type,
    });

    // Update status
    await supabase
      .from('resources')
      .update({
        is_vectorized: true,
        vectorization_status: 'completed',
        chunk_count: chunks.length,
        last_vectorized_at: new Date().toISOString()
      })
      .eq('id', resourceId);

    logger.info('Successfully vectorized resource', { resourceId, chunkCount: chunks.length });

  } catch (error) {
    logger.error('Vectorization failed', { resourceId, error: error.message });

    await supabase
      .from('resources')
      .update({
        vectorization_status: 'failed',
        last_vectorized_at: new Date().toISOString()
      })
      .eq('id', resourceId);
  }
}

async function summarizeResource(resourceId) {
  try {
    logger.info('Starting summarization', { resourceId });

    // Get resource
    const { data: resource, error: fetchError } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resourceId)
      .single();

    if (fetchError || !resource) {
      throw new Error('Resource not found');
    }

    // For PowerPoint files, use description; for others, extract text
    let extracted;
    if (resource.resource_type === 'presentation') {
      logger.info('Using description for PowerPoint summarization', { resourceId });

      if (!resource.description || resource.description.trim().length < 10) {
        logger.info('No description for PowerPoint, skipping summarization', { resourceId });
        return;
      }

      extracted = {
        text: resource.description,
        pageCount: 1
      };
    } else {
      // Extract text (reuse from vectorization or extract fresh)
      logger.info('Extracting text for summarization', { resourceId, type: resource.resource_type });
      extracted = await documentProcessor.extractText(
        resourceId,
        resource.file_path,
        resource.resource_type
      );

      if (!extracted.text || extracted.text.trim().length < 10) {
        logger.info('Minimal text extracted, skipping summarization', { resourceId });
        return;
      }
    }

    // Generate summary and keywords
    logger.info('Generating summary and keywords', { resourceId });
    const summary = await summarizationService.generateSummary(extracted.text);
    const keywords = summarizationService.extractKeywords(extracted.text);
    const topicTags = summarizationService.extractTopicTags(extracted.text, keywords);

    // Store in database
    await supabase
      .from('resources')
      .update({
        summary: summary,
        extractive_keywords: keywords,
        topic_tags: topicTags,
        summary_generated_at: new Date().toISOString()
      })
      .eq('id', resourceId);

    logger.info('Successfully generated summary', { resourceId, keywordCount: keywords.length, topicCount: topicTags.length });

  } catch (error) {
    logger.error('Summarization failed', { resourceId, error: error.message });
    // Don't update DB with failure - summarization is optional
  }
}

module.exports = router;

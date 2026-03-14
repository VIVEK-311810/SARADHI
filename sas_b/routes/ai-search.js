const express = require('express');
const pool = require('../db');
const { supabase } = require('../config/supabase');
const embeddingService = require('../services/embeddingService');
const vectorStore = require('../services/vectorStore');
const queryClassifier = require('../services/queryClassifier');
const summarizationService = require('../services/summarizationService');
const ragService = require('../services/ragService');
const { authenticate } = require('../middleware/auth');

const logger = require('../logger');

const router = express.Router();

// POST /api/ai-search/session/:sessionId - Enhanced search with query classification
router.post('/session/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { query } = req.body;
    // Clamp top_k to prevent abuse (max 20 chunks)
    const top_k = Math.min(parseInt(req.body.top_k) || 5, 20);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required' });
    }
    if (query.length > 500) {
      return res.status(400).json({ error: 'Query too long (max 500 characters)' });
    }

    // Verify user is a participant in (or the teacher of) this session — prevents IDOR
    const sessionCheck = await pool.query(
      `SELECT 1 FROM sessions s
       WHERE s.session_id = $1
         AND (
           s.teacher_id = $2
           OR EXISTS (
             SELECT 1 FROM session_participants sp
             WHERE sp.session_id = s.id AND sp.student_id = $2
           )
         )`,
      [sessionId.toUpperCase(), req.user.id]
    );
    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: not a participant in this session' });
    }

    logger.info('AI search request', { sessionId, queryLength: query.length });

    // 1. Classify query to determine intent
    const classification = await queryClassifier.getCachedOrClassify(query, sessionId);
    logger.info('Query classified', { type: classification.type, sessionId });

    // 2. Route to appropriate handler based on classification
    switch (classification.type) {
      case 'list_all':
        return await handleListAll(req, res, sessionId);

      case 'filter_by_topic':
        return await handleTopicFilter(req, res, sessionId, classification.topic, top_k);

      case 'summarize_file':
        return await handleSummarize(req, res, sessionId, classification.fileName);

      case 'specific_file_question':
        return await handleFileSpecificQuestion(req, res, sessionId, classification.fileName, query, top_k);

      case 'general_question':
      default:
        return await handleGeneralQuestion(req, res, sessionId, query, top_k);
    }

  } catch (error) {
    logger.error('AI search error', { error: error.message, sessionId: req.params.sessionId });

    let statusCode = 500;
    let userMessage = 'Search failed. Please try again.';

    if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      userMessage = 'AI service rate limit reached. Please wait a moment before trying again.';
      statusCode = 429;
    } else if (error.message?.includes('loading') || error.message?.includes('503')) {
      userMessage = 'AI model is starting up. Please try again in a few seconds.';
      statusCode = 503;
    }

    res.status(statusCode).json({ error: userMessage });
  }
});

// Handler 1: List all resources
async function handleListAll(req, res, sessionId) {
  try {
    const { data: resources, error } = await supabase
      .from('resources')
      .select('id, title, file_name, resource_type, summary, file_url, is_vectorized, created_at')
      .eq('session_id', sessionId.toUpperCase())
      .eq('is_vectorized', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Log access
    if (resources && resources.length > 0) {
      resources.forEach(async (resource) => {
        await supabase
          .from('resource_access_logs')
          .insert({
            resource_id: resource.id,
            student_id: req.user.id,
            action: 'list_view',
            search_query: 'list all resources'
          })
          .catch(err => logger.warn('Error logging resource access', { error: err.message }));
      });
    }

    res.json({
      type: 'resource_list',
      count: resources?.length || 0,
      resources: resources || [],
      message: resources?.length > 0 ? `Found ${resources.length} resources` : 'No resources available'
    });
  } catch (error) {
    logger.error('Error listing resources', { error: error.message });
    throw error;
  }
}

// Handler 2: Filter resources by topic
async function handleTopicFilter(req, res, sessionId, topic, top_k) {
  try {
    // Fast path: keyword match in extractive_keywords array
    const { data: keywordMatches, error: kwError } = await supabase
      .from('resources')
      .select('id, title, file_name, resource_type, summary, file_url, extractive_keywords')
      .eq('session_id', sessionId.toUpperCase())
      .eq('is_vectorized', true)
      .contains('extractive_keywords', [topic.toLowerCase()]);

    if (!kwError && keywordMatches && keywordMatches.length > 0) {
      logger.info('Found resources via keyword match', { count: keywordMatches.length });
      return res.json({
        type: 'filtered_resources',
        topic: topic,
        count: keywordMatches.length,
        resources: keywordMatches
      });
    }

    // Slow path: vector search
    logger.info('No keyword matches, falling back to vector search');
    const embedding = await embeddingService.generateEmbedding(topic);
    const results = await vectorStore.searchSimilar(embedding, sessionId, top_k * 2);

    // Group by resource and get unique resources
    const resourceIds = [...new Set(results.map(r => r.resourceId))];
    const { data: resources, error: resError } = await supabase
      .from('resources')
      .select('id, title, file_name, resource_type, summary, file_url')
      .in('id', resourceIds)
      .eq('session_id', sessionId.toUpperCase());

    if (resError) throw resError;

    res.json({
      type: 'filtered_resources',
      topic: topic,
      count: resources?.length || 0,
      resources: resources || []
    });
  } catch (error) {
    logger.error('Error filtering by topic', { error: error.message });
    throw error;
  }
}

// Handler 3: Summarize specific file
async function handleSummarize(req, res, sessionId, fileName) {
  try {
    // Find resource by file name (case insensitive)
    const { data: resource, error: findError } = await supabase
      .from('resources')
      .select('*')
      .eq('session_id', sessionId.toUpperCase())
      .ilike('file_name', `%${fileName}%`)
      .single();

    if (findError || !resource) {
      return res.status(404).json({
        type: 'error',
        error: `File "${fileName}" not found in this session`
      });
    }

    // Check if summary exists
    if (!resource.summary) {
      logger.info('Generating on-demand summary', { resourceId: resource.id });

      // Get full text from chunks
      const { data: chunks, error: chunkError } = await supabase
        .from('resource_chunks')
        .select('chunk_text')
        .eq('resource_id', resource.id)
        .order('chunk_index');

      if (chunkError) throw chunkError;

      const fullText = chunks?.map(c => c.chunk_text).join(' ') || '';

      if (!fullText || fullText.trim().length === 0) {
        return res.json({
          type: 'file_summary',
          resource: {
            id: resource.id,
            title: resource.title,
            file_name: resource.file_name,
            resource_type: resource.resource_type,
            file_url: resource.file_url
          },
          summary: 'No text content available to summarize.'
        });
      }

      // Generate summary
      const summary = await summarizationService.generateSummary(fullText);

      // Store summary
      await supabase
        .from('resources')
        .update({
          summary: summary,
          summary_generated_at: new Date().toISOString()
        })
        .eq('id', resource.id);

      resource.summary = summary;
    }

    // Log access
    await supabase
      .from('resource_access_logs')
      .insert({
        resource_id: resource.id,
        student_id: req.user.id,
        action: 'summary_view',
        search_query: `summarize ${fileName}`
      })
      .catch(err => logger.warn('Error logging resource access', { error: err.message }));

    res.json({
      type: 'file_summary',
      resource: {
        id: resource.id,
        title: resource.title,
        file_name: resource.file_name,
        resource_type: resource.resource_type,
        file_url: resource.file_url
      },
      summary: resource.summary
    });
  } catch (error) {
    logger.error('Error summarizing file', { error: error.message });
    throw error;
  }
}

// Handler 4: Answer question about specific file
async function handleFileSpecificQuestion(req, res, sessionId, fileName, query, top_k) {
  try {
    // Find resource by file name
    const { data: resource, error: findError } = await supabase
      .from('resources')
      .select('id, title, file_name, resource_type, file_url')
      .eq('session_id', sessionId.toUpperCase())
      .ilike('file_name', `%${fileName}%`)
      .single();

    if (findError || !resource) {
      return res.status(404).json({
        type: 'error',
        error: `File "${fileName}" not found in this session`
      });
    }

    // Generate embedding for query
    const embedding = await embeddingService.generateEmbedding(query);

    // Search vectors - get more results first, then filter by resource
    const allChunks = await vectorStore.searchSimilar(embedding, sessionId, top_k * 4);
    const resourceChunks = allChunks
      .filter(c => c.resourceId === resource.id)
      .slice(0, top_k);

    if (resourceChunks.length === 0) {
      return res.json({
        type: 'rag_answer',
        answer: `I couldn't find relevant information in "${fileName}" to answer your question.`,
        resource: resource,
        sources: []
      });
    }

    // Enrich chunks with resource metadata
    const enrichedChunks = resourceChunks.map(chunk => ({
      ...chunk,
      resource_title: resource.title,
      resource_url: resource.file_url,
      resource_type: resource.resource_type,
      file_name: resource.file_name
    }));

    // Generate RAG answer
    const result = await ragService.generateAnswer(query, enrichedChunks, 'specific_file');

    // Log search
    await supabase
      .from('resource_access_logs')
      .insert({
        resource_id: resource.id,
        student_id: req.user.id,
        action: 'search_result',
        search_query: query,
        similarity_score: resourceChunks[0]?.similarityScore
      })
      .catch(err => logger.warn('Error logging search access', { error: err.message }));

    res.json({
      type: 'rag_answer',
      answer: result.answer,
      resource: resource,
      sources: result.sources,
      confidence: result.confidence
    });
  } catch (error) {
    logger.error('Error answering file-specific question', { error: error.message });
    throw error;
  }
}

// Handler 5: Answer general question with RAG
async function handleGeneralQuestion(req, res, sessionId, query, top_k) {
  try {
    // Generate embedding
    const embedding = await embeddingService.generateEmbedding(query);

    // Vector search
    const chunks = await vectorStore.searchSimilar(embedding, sessionId, top_k);

    if (chunks.length === 0) {
      return res.json({
        type: 'rag_answer',
        answer: 'I couldn\'t find relevant information in the session materials to answer your question.',
        sources: [],
        confidence: 0.0
      });
    }

    // Batch fetch all resource metadata in one query (N+1 fix)
    const resourceIds = [...new Set(chunks.map(c => c.resourceId))];
    const { data: resources } = await supabase
      .from('resources')
      .select('id, title, file_url, resource_type, file_name')
      .in('id', resourceIds)
      .eq('session_id', sessionId.toUpperCase());

    const resourceMap = Object.fromEntries((resources || []).map(r => [r.id, r]));

    const enrichedChunks = chunks.map(chunk => {
      const resource = resourceMap[chunk.resourceId];
      return {
        ...chunk,
        resource_title: resource?.title,
        resource_url: resource?.file_url,
        resource_type: resource?.resource_type,
        file_name: resource?.file_name
      };
    });

    // Generate RAG answer
    const result = await ragService.generateAnswer(query, enrichedChunks, 'general');

    // Log search (async, don't wait)
    enrichedChunks.forEach(async (chunk) => {
      const { error } = await supabase
        .from('resource_access_logs')
        .insert({
          resource_id: chunk.resourceId,
          student_id: req.user.id,
          action: 'search_result',
          search_query: query,
          similarity_score: chunk.similarityScore
        });
      if (error) logger.warn('Error logging search access', { error: error.message });
    });

    res.json({
      type: 'rag_answer',
      answer: result.answer,
      sources: result.sources,
      confidence: result.confidence
    });
  } catch (error) {
    logger.error('Error answering general question', { error: error.message });
    throw error;
  }
}

module.exports = router;

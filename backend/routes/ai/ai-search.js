const express = require('express');
const pool = require('../../db');
const { supabase } = require('../../config/supabase');
const embeddingService = require('../../services/rag/embeddingService');
const vectorStore = require('../../services/rag/vectorStore');
const queryClassifier = require('../../services/queryClassifier');
const summarizationService = require('../../services/content/summarizationService');
const ragService = require('../../services/rag/ragService');
const { authenticate } = require('../../middleware/auth');

const logger = require('../../logger');

const router = express.Router();

/**
 * Fetch the last N Q&A pairs from the student's most recent active AI conversation
 * in this session. Returns [{role,content},...] ready to pass as conversationHistory.
 * Returns [] if no history exists (first query, no Redis required).
 */
async function getRecentConversationHistory(studentId, sessionId, pairLimit = 3) {
  try {
    const result = await pool.query(
      `SELECT m.role, m.content
       FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE c.student_id = $1
         AND c.session_id = $2
         AND c.is_active = TRUE
         AND m.message_type IN ('text', 'answer')
       ORDER BY c.updated_at DESC, m.created_at DESC
       LIMIT $3`,
      [studentId, sessionId.toUpperCase(), pairLimit * 2]  // pairs × 2 roles
    );
    // Reverse so oldest messages come first (chronological order for prompt)
    return result.rows.reverse();
  } catch {
    // Non-critical — search still works without history
    return [];
  }
}

/**
 * Fetch the subject of a session for subject-aware AI prompting.
 * Returns null if the session has no subject or if the query fails.
 */
async function getSessionSubject(sessionId) {
  try {
    const result = await pool.query(
      'SELECT subject FROM sessions WHERE session_id = $1 LIMIT 1',
      [sessionId.toUpperCase()]
    );
    return result.rows[0]?.subject || null;
  } catch {
    return null;
  }
}

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

    // Log access — single batch insert instead of per-resource fire-and-forget
    if (resources && resources.length > 0) {
      const logEntries = resources.map(resource => ({
        resource_id: resource.id,
        student_id: req.user.id,
        action: 'list_view',
        search_query: 'list all resources'
      }));
      supabase.from('resource_access_logs').insert(logEntries)
        .then(({ error }) => { if (error) logger.warn('Error logging resource access', { error: error.message }); });
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

    // Fetch recent conversation history to support follow-up questions
    const conversationHistory = await getRecentConversationHistory(req.user.id, sessionId);

    // Fetch session subject for subject-aware prompting
    const sessionSubject = await getSessionSubject(sessionId);

    // Generate RAG answer
    const result = await ragService.generateAnswer(query, enrichedChunks, { queryType: 'specific_file', conversationHistory, subject: sessionSubject });

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

    // Fetch recent conversation history to support follow-up questions
    const conversationHistory = await getRecentConversationHistory(req.user.id, sessionId);

    // Fetch session subject for subject-aware prompting
    const sessionSubject = await getSessionSubject(sessionId);

    // Generate RAG answer
    const result = await ragService.generateAnswer(query, enrichedChunks, { queryType: 'general', conversationHistory, subject: sessionSubject });

    // Log search — single batch insert, non-blocking
    if (enrichedChunks.length > 0) {
      const logEntries = enrichedChunks.map(chunk => ({
        resource_id: chunk.resourceId,
        student_id: req.user.id,
        action: 'search_result',
        search_query: query,
        similarity_score: chunk.similarityScore
      }));
      supabase.from('resource_access_logs').insert(logEntries)
        .then(({ error }) => { if (error) logger.warn('Error logging search access', { error: error.message }); });
    }

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

// POST /api/ai-search/session/:sessionId/async
// Enqueues the search and returns a jobId immediately. Client polls GET /job/:jobId for result.
router.post('/session/:sessionId/async', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { query } = req.body;
    const top_k = Math.min(parseInt(req.body.top_k) || 5, 20);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required' });
    }
    if (query.length > 500) {
      return res.status(400).json({ error: 'Query too long (max 500 characters)' });
    }

    // Verify session membership (same check as sync route)
    const sessionCheck = await pool.query(
      `SELECT 1 FROM sessions s
       WHERE s.session_id = $1
         AND (s.teacher_id = $2 OR EXISTS (
           SELECT 1 FROM session_participants sp WHERE sp.session_id = s.id AND sp.student_id = $2
         ))`,
      [sessionId.toUpperCase(), req.user.id]
    );
    if (sessionCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: not a participant in this session' });
    }

    const { aiSearchQueue } = require('../../queues');

    // If queue not available (no Redis), fall back to synchronous path
    if (!aiSearchQueue) {
      return router.handle(
        Object.assign(req, { url: `/session/${sessionId}` }),
        res
      );
    }

    const job = await aiSearchQueue.add('search', {
      sessionId: sessionId.toUpperCase(),
      query,
      top_k,
      userId: req.user.id,
    });

    res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (error) {
    logger.error('AI search async enqueue error', { error: error.message });
    res.status(500).json({ error: 'Failed to queue search request' });
  }
});

// GET /api/ai-search/job/:jobId
// Poll for async search result. Returns 202 while pending, 200 with result when done, 500 on failure.
router.get('/job/:jobId', authenticate, async (req, res) => {
  try {
    const { aiSearchQueue } = require('../../queues');
    if (!aiSearchQueue) return res.status(503).json({ error: 'Async search not available' });

    const job = await aiSearchQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();

    if (state === 'completed') {
      return res.json({ status: 'completed', result: job.returnvalue });
    }
    if (state === 'failed') {
      logger.warn('AI search job failed', { jobId: req.params.jobId, reason: job.failedReason });
      return res.status(500).json({ status: 'failed', error: 'Search failed. Please try again.' });
    }

    // active, waiting, delayed
    res.status(202).json({ status: state });
  } catch (error) {
    logger.error('AI search job poll error', { error: error.message });
    res.status(500).json({ error: 'Failed to check job status' });
  }
});

// Exported for the BullMQ worker — runs the actual search logic without an HTTP req/res
async function handleAiSearchJob({ sessionId, query, top_k, userId }) {
  const classification = await queryClassifier.getCachedOrClassify(query, sessionId);

  // Build minimal mock req/res so existing handlers can be reused
  let result;
  const mockRes = {
    _data: null,
    json(data) { this._data = data; return this; },
    status() { return this; },
  };
  const mockReq = { user: { id: userId }, body: { query }, query: {} };

  switch (classification.type) {
    case 'list_all':
      await handleListAll(mockReq, mockRes, sessionId);
      break;
    case 'filter_by_topic':
      await handleTopicFilter(mockReq, mockRes, sessionId, classification.topic, top_k);
      break;
    case 'summarize_file':
      await handleSummarize(mockReq, mockRes, sessionId, classification.fileName);
      break;
    case 'specific_file_question':
      await handleFileSpecificQuestion(mockReq, mockRes, sessionId, classification.fileName, query, top_k);
      break;
    case 'general_question':
    default:
      await handleGeneralQuestion(mockReq, mockRes, sessionId, query, top_k);
  }

  return mockRes._data;
}

module.exports = router;
module.exports.handleAiSearchJob = handleAiSearchJob;

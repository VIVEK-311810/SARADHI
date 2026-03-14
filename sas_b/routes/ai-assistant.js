const express = require('express');
const { supabase } = require('../config/supabase');
const embeddingService = require('../services/embeddingService');
const vectorStore = require('../services/vectorStore');
const queryClassifier = require('../services/queryClassifier');
const summarizationService = require('../services/summarizationService');
const ragService = require('../services/ragService');
const quizGenerator = require('../services/quizGenerator');
const requestQueue = require('../services/requestQueue');
const cacheService = require('../services/cacheService');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();

// ─── SSE Chat Endpoint ──────────────────────────────────────────────────────

router.post('/session/:sessionId/chat', authenticate, async (req, res) => {
  const { sessionId } = req.params;
  const { message, conversationId, mode = 'answer' } = req.body;
  const studentId = req.user.id;

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Get or create conversation
    sendSSE('status', { stage: 'starting' });
    let activeConversationId = conversationId;

    if (!activeConversationId) {
      // Create new conversation
      const { data: conv, error: convError } = await supabase
        .from('ai_conversations')
        .insert({
          session_id: sessionId.toUpperCase(),
          student_id: studentId,
          title: message.substring(0, 100),
        })
        .select('id')
        .single();

      if (convError) throw convError;
      activeConversationId = conv.id;
    }

    // 2. Save user message
    await supabase.from('ai_messages').insert({
      conversation_id: activeConversationId,
      role: 'user',
      content: message,
      message_type: 'text',
    });

    // 3. Classify query
    sendSSE('status', { stage: 'classifying' });
    const classification = await queryClassifier.getCachedOrClassify(message, sessionId);
    logger.info('AI Assistant query classified', { type: classification.type, sessionId });

    // 4. Load conversation history for follow-ups
    let conversationHistory = [];
    if (activeConversationId) {
      const { data: historyMessages } = await supabase
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', activeConversationId)
        .order('created_at', { ascending: true })
        .limit(10);

      conversationHistory = historyMessages || [];
    }

    // 5. Route based on classification type
    let answerText = '';
    let messageType = 'text';
    let metadata = {};

    switch (classification.type) {
      case 'list_all':
        await handleListAll(sendSSE, sessionId);
        messageType = 'resource_list';
        answerText = 'Here are all the resources available in this session.';
        break;

      case 'filter_by_topic':
        await handleTopicFilter(sendSSE, sessionId, classification.topic);
        messageType = 'resource_list';
        answerText = `Here are resources related to "${classification.topic}".`;
        break;

      case 'summarize_file':
        answerText = await handleSummarize(sendSSE, sessionId, classification.fileName, req.user.id);
        messageType = 'summary';
        break;

      case 'generate_quiz': {
        const quizResult = await handleGenerateQuiz(sendSSE, sessionId, classification.topic, message);
        answerText = JSON.stringify(quizResult);
        messageType = 'quiz';
        metadata = { questions: quizResult };
        break;
      }

      case 'explain_concept':
      case 'specific_file_question':
      case 'general_question':
      default: {
        // RAG pipeline with streaming
        const effectiveMode = classification.type === 'explain_concept' ? 'explain' : mode;
        const result = await handleRAGQuery(
          sendSSE, res, sessionId, message, classification, conversationHistory, effectiveMode
        );
        answerText = result.answer;
        metadata = {
          sources: result.sources,
          confidence: result.confidence,
          confidenceLabel: result.confidenceLabel,
          suggestedFollowups: result.suggestedFollowups,
        };
        break;
      }
    }

    // 6. Save assistant message
    const { data: savedMessage } = await supabase
      .from('ai_messages')
      .insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: answerText,
        message_type: messageType,
        metadata,
      })
      .select('id')
      .single();

    // 7. Update study analytics (async, don't block)
    updateStudyAnalytics(studentId, sessionId, classification.topic).catch(() => {});

    // 8. Send done event
    sendSSE('done', {
      messageId: savedMessage?.id,
      conversationId: activeConversationId,
    });

    res.end();
  } catch (error) {
    logger.error('AI Assistant chat error', { error: error.message, sessionId });
    sendSSE('error', { message: 'Something went wrong. Please try again.' });
    res.end();
  }
});

// ─── RAG Query Handler (streaming) ──────────────────────────────────────────

async function handleRAGQuery(sendSSE, res, sessionId, query, classification, conversationHistory, mode) {
  // Retrieve relevant chunks
  sendSSE('status', { stage: 'retrieving' });

  const result = await requestQueue.enqueue(async () => {
    const embedding = await embeddingService.generateEmbedding(query);
    let chunks = await vectorStore.searchSimilar(embedding, sessionId.toUpperCase(), 8);

    // If specific file question, filter to that file's chunks
    if (classification.type === 'specific_file_question' && classification.fileName) {
      const fileChunks = chunks.filter(c =>
        c.file_name && c.file_name.toLowerCase().includes(classification.fileName.toLowerCase())
      );
      if (fileChunks.length > 0) chunks = fileChunks;
    }

    sendSSE('status', { stage: 'generating', chunkCount: chunks.length });

    if (chunks.length === 0) {
      sendSSE('token', { text: 'I couldn\'t find relevant information in the session materials to answer your question.' });
      sendSSE('sources', { sources: [], confidence: 0, confidenceLabel: 'none' });
      sendSSE('suggestions', { followups: [] });
      return {
        answer: 'I couldn\'t find relevant information in the session materials to answer your question.',
        sources: [],
        confidence: 0,
        confidenceLabel: 'none',
        suggestedFollowups: [],
      };
    }

    // Enrich chunks with resource metadata for those missing denormalized fields
    const chunksNeedingMeta = chunks.filter(c => !c.resource_title);
    if (chunksNeedingMeta.length > 0) {
      const resourceIds = [...new Set(chunksNeedingMeta.map(c => c.resourceId))];
      const { data: resources } = await supabase
        .from('resources')
        .select('id, title, file_url, resource_type, file_name')
        .in('id', resourceIds);

      const resourceMap = Object.fromEntries((resources || []).map(r => [r.id, r]));

      chunks = chunks.map(chunk => {
        if (!chunk.resource_title) {
          const resource = resourceMap[chunk.resourceId];
          return {
            ...chunk,
            resource_title: resource?.title,
            resource_url: resource?.file_url,
            resource_type: resource?.resource_type,
            file_name: resource?.file_name,
          };
        }
        return chunk;
      });
    }

    // Stream the RAG answer
    const answerText = await ragService.generateAnswerStream(
      query, chunks, res, { queryType: classification.type, conversationHistory, mode }
    );

    const { score, label } = ragService.computeConfidence(chunks);

    return {
      answer: answerText,
      sources: ragService.formatSources(chunks),
      confidence: score,
      confidenceLabel: label,
      suggestedFollowups: [],
    };
  });

  return result;
}

// ─── List All Resources ─────────────────────────────────────────────────────

async function handleListAll(sendSSE, sessionId) {
  const { data: resources, error } = await supabase
    .from('resources')
    .select('id, title, file_name, resource_type, summary, file_url, is_vectorized, uploaded_at')
    .eq('session_id', sessionId.toUpperCase())
    .order('uploaded_at', { ascending: false });

  if (error) throw error;

  const msg = resources && resources.length > 0
    ? `Found ${resources.length} resources in this session.`
    : 'No resources have been uploaded to this session yet.';

  sendSSE('token', { text: msg });
  sendSSE('resources', { resources: resources || [], count: resources?.length || 0 });
  sendSSE('sources', { sources: [], confidence: 1, confidenceLabel: 'high' });
  sendSSE('suggestions', { followups: [
    'Summarize the first resource',
    'What topics are covered in these materials?',
    'Generate a quiz from these resources',
  ]});
}

// ─── Filter by Topic ────────────────────────────────────────────────────────

async function handleTopicFilter(sendSSE, sessionId, topic) {
  // Fast path: keyword match
  const { data: keywordMatches } = await supabase
    .from('resources')
    .select('id, title, file_name, resource_type, summary, file_url, extractive_keywords')
    .eq('session_id', sessionId.toUpperCase())
    .eq('is_vectorized', true)
    .contains('extractive_keywords', [topic.toLowerCase()]);

  if (keywordMatches && keywordMatches.length > 0) {
    sendSSE('token', { text: `Found ${keywordMatches.length} resources related to "${topic}".` });
    sendSSE('resources', { resources: keywordMatches, count: keywordMatches.length, topic });
    sendSSE('sources', { sources: [], confidence: 0.9, confidenceLabel: 'high' });
    sendSSE('suggestions', { followups: [
      `Explain ${topic} in detail`,
      `Generate a quiz on ${topic}`,
      `What are the key concepts in ${topic}?`,
    ]});
    return;
  }

  // Slow path: vector search
  const embedding = await embeddingService.generateEmbedding(topic);
  const results = await vectorStore.searchSimilar(embedding, sessionId.toUpperCase(), 10);

  const resourceIds = [...new Set(results.map(r => r.resourceId))];
  const { data: resources } = await supabase
    .from('resources')
    .select('id, title, file_name, resource_type, summary, file_url')
    .in('id', resourceIds);

  const count = resources?.length || 0;
  sendSSE('token', { text: count > 0 ? `Found ${count} resources related to "${topic}".` : `No resources found for "${topic}".` });
  sendSSE('resources', { resources: resources || [], count, topic });
  sendSSE('sources', { sources: [], confidence: count > 0 ? 0.7 : 0, confidenceLabel: count > 0 ? 'medium' : 'none' });
  sendSSE('suggestions', { followups: [
    `Explain ${topic} in detail`,
    'List all resources',
    `What are the key concepts in ${topic}?`,
  ]});
}

// ─── Summarize File ─────────────────────────────────────────────────────────

async function handleSummarize(sendSSE, sessionId, fileName, studentId) {
  const { data: resource, error } = await supabase
    .from('resources')
    .select('*')
    .eq('session_id', sessionId.toUpperCase())
    .ilike('file_name', `%${fileName}%`)
    .single();

  if (error || !resource) {
    const msg = `File "${fileName}" not found in this session.`;
    sendSSE('token', { text: msg });
    sendSSE('sources', { sources: [], confidence: 0, confidenceLabel: 'none' });
    sendSSE('suggestions', { followups: ['List all resources'] });
    return msg;
  }

  let summary = resource.summary;

  if (!summary) {
    sendSSE('status', { stage: 'summarizing' });

    const { data: chunks } = await supabase
      .from('resource_chunks')
      .select('chunk_text')
      .eq('resource_id', resource.id)
      .order('chunk_index');

    const fullText = chunks?.map(c => c.chunk_text).join(' ') || '';

    if (fullText.trim().length === 0) {
      const msg = 'No text content available to summarize.';
      sendSSE('token', { text: msg });
      sendSSE('sources', { sources: [], confidence: 0, confidenceLabel: 'none' });
      return msg;
    }

    summary = await requestQueue.enqueue(() => summarizationService.generateSummary(fullText));

    // Store summary for future use
    await supabase
      .from('resources')
      .update({ summary, summary_generated_at: new Date().toISOString() })
      .eq('id', resource.id);
  }

  sendSSE('token', { text: summary });
  sendSSE('sources', {
    sources: [{
      resourceId: resource.id,
      resourceTitle: resource.title,
      fileName: resource.file_name,
      resourceType: resource.resource_type,
      fileUrl: resource.file_url,
    }],
    confidence: 0.9,
    confidenceLabel: 'high',
  });
  sendSSE('suggestions', { followups: [
    `What are the key concepts in ${resource.title}?`,
    `Generate a quiz from ${resource.file_name}`,
    'List all resources',
  ]});

  return summary;
}

// ─── Generate Quiz ──────────────────────────────────────────────────────────

async function handleGenerateQuiz(sendSSE, sessionId, topic, originalQuery) {
  sendSSE('status', { stage: 'generating quiz' });

  // Get relevant chunks via vector search
  const searchTerm = topic || originalQuery;
  const embedding = await embeddingService.generateEmbedding(searchTerm);
  const chunks = await vectorStore.searchSimilar(embedding, sessionId.toUpperCase(), 10);

  if (chunks.length === 0) {
    sendSSE('token', { text: 'No course material found to generate a quiz from.' });
    sendSSE('sources', { sources: [], confidence: 0, confidenceLabel: 'none' });
    return [];
  }

  const questions = await requestQueue.enqueue(() =>
    quizGenerator.generateFromContext(chunks, topic, 5)
  );

  sendSSE('token', { text: `Generated ${questions.length} practice questions for you!` });
  sendSSE('quiz', { questions });
  sendSSE('sources', {
    sources: ragService.formatSources(chunks.slice(0, 3)),
    confidence: 0.85,
    confidenceLabel: 'high',
  });
  sendSSE('suggestions', { followups: [
    'Explain the concepts from this quiz',
    'Generate more questions on a different topic',
    'List all resources',
  ]});

  return questions;
}

// ─── Conversation CRUD ──────────────────────────────────────────────────────

// List conversations for a session
router.get('/session/:sessionId/conversations', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = req.user.id;

    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, title, created_at, updated_at')
      .eq('session_id', sessionId.toUpperCase())
      .eq('student_id', studentId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ conversations: data || [] });
  } catch (error) {
    logger.error('Error listing conversations', { error: error.message });
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const studentId = req.user.id;

    // Verify ownership (IDOR prevention)
    const { data: conv, error: convError } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('student_id', studentId)
      .single();

    if (convError || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { data: messages, error } = await supabase
      .from('ai_messages')
      .select('id, role, content, message_type, metadata, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ messages: messages || [] });
  } catch (error) {
    logger.error('Error loading messages', { error: error.message });
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Delete conversation (soft delete)
router.delete('/conversations/:conversationId', authenticate, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const studentId = req.user.id;

    const { error } = await supabase
      .from('ai_conversations')
      .update({ is_active: false })
      .eq('id', conversationId)
      .eq('student_id', studentId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting conversation', { error: error.message });
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ─── Doubt Tracking ─────────────────────────────────────────────────────────

// Mark a message as "still confused"
router.post('/messages/:messageId/doubt', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const studentId = req.user.id;

    // Get the message and its conversation to find session_id
    const { data: msg, error: msgError } = await supabase
      .from('ai_messages')
      .select('id, content, conversation_id')
      .eq('id', messageId)
      .single();

    if (msgError || !msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const { data: conv } = await supabase
      .from('ai_conversations')
      .select('session_id')
      .eq('id', msg.conversation_id)
      .eq('student_id', studentId)
      .single();

    if (!conv) {
      return res.status(403).json({ error: 'Not your conversation' });
    }

    const { data: doubt, error } = await supabase
      .from('ai_doubts')
      .insert({
        message_id: messageId,
        session_id: conv.session_id,
        student_id: studentId,
        doubt_text: msg.content.substring(0, 500),
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ success: true, doubtId: doubt.id });
  } catch (error) {
    logger.error('Error creating doubt', { error: error.message });
    res.status(500).json({ error: 'Failed to mark doubt' });
  }
});

// Teacher: view unresolved doubts for a session
router.get('/session/:sessionId/doubts', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: doubts, error } = await supabase
      .from('ai_doubts')
      .select(`
        id, doubt_text, status, created_at,
        student_id,
        ai_messages (content, metadata)
      `)
      .eq('session_id', sessionId.toUpperCase())
      .eq('status', 'unresolved')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get student names
    const studentIds = [...new Set((doubts || []).map(d => d.student_id))];
    let studentMap = {};
    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', studentIds);

      studentMap = Object.fromEntries((students || []).map(s => [s.id, s]));
    }

    const enrichedDoubts = (doubts || []).map(d => ({
      ...d,
      student_name: studentMap[d.student_id]?.full_name || 'Unknown',
      student_email: studentMap[d.student_id]?.email || '',
    }));

    res.json({ doubts: enrichedDoubts });
  } catch (error) {
    logger.error('Error fetching doubts', { error: error.message });
    res.status(500).json({ error: 'Failed to load doubts' });
  }
});

// Teacher: resolve a doubt
router.post('/doubts/:doubtId/resolve', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { doubtId } = req.params;

    const { error } = await supabase
      .from('ai_doubts')
      .update({
        status: 'resolved',
        resolved_by: req.user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', doubtId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    logger.error('Error resolving doubt', { error: error.message });
    res.status(500).json({ error: 'Failed to resolve doubt' });
  }
});

// ─── Study Summary ──────────────────────────────────────────────────────────

router.get('/session/:sessionId/study-summary', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = req.user.id;

    // Get analytics
    const { data: analytics } = await supabase
      .from('ai_study_analytics')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId.toUpperCase())
      .single();

    // Get doubt counts
    const { data: doubts } = await supabase
      .from('ai_doubts')
      .select('status')
      .eq('student_id', studentId)
      .eq('session_id', sessionId.toUpperCase());

    const unresolvedDoubts = (doubts || []).filter(d => d.status === 'unresolved').length;
    const resolvedDoubts = (doubts || []).filter(d => d.status === 'resolved').length;

    // Get conversation count
    const { count: conversationCount } = await supabase
      .from('ai_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('session_id', sessionId.toUpperCase())
      .eq('is_active', true);

    res.json({
      totalQueries: analytics?.total_queries || 0,
      topicsExplored: analytics?.topics_explored || [],
      lastQueryAt: analytics?.last_query_at,
      studyDurationMinutes: analytics?.study_duration_minutes || 0,
      conversations: conversationCount || 0,
      doubts: { unresolved: unresolvedDoubts, resolved: resolvedDoubts },
    });
  } catch (error) {
    logger.error('Error fetching study summary', { error: error.message });
    res.status(500).json({ error: 'Failed to load study summary' });
  }
});

// ─── Quiz Generation Endpoint ───────────────────────────────────────────────

router.post('/session/:sessionId/generate-quiz', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { topic, resourceId, count = 5 } = req.body;

    let chunks;

    if (resourceId) {
      // Generate from specific resource
      const { data: resourceChunks } = await supabase
        .from('resource_chunks')
        .select('chunk_text, chunk_index, page_number, section_title, resource_id')
        .eq('resource_id', resourceId)
        .order('chunk_index');

      chunks = (resourceChunks || []).map(c => ({
        text: c.chunk_text,
        pageNumber: c.page_number,
        sectionTitle: c.section_title,
        resourceId: c.resource_id,
      }));
    } else {
      // Generate from topic search
      const searchTerm = topic || 'main concepts';
      const embedding = await embeddingService.generateEmbedding(searchTerm);
      chunks = await vectorStore.searchSimilar(embedding, sessionId.toUpperCase(), 10);
    }

    if (!chunks || chunks.length === 0) {
      return res.status(404).json({ error: 'No course material found to generate quiz.' });
    }

    const questions = await requestQueue.enqueue(() =>
      quizGenerator.generateFromContext(chunks, topic, Math.min(count, 10))
    );

    res.json({ questions, topic, count: questions.length });
  } catch (error) {
    logger.error('Error generating quiz', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to generate quiz' });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateStudyAnalytics(studentId, sessionId, topic) {
  try {
    const normalizedSessionId = sessionId.toUpperCase();

    // Upsert analytics record
    const { data: existing } = await supabase
      .from('ai_study_analytics')
      .select('id, total_queries, topics_explored')
      .eq('student_id', studentId)
      .eq('session_id', normalizedSessionId)
      .single();

    if (existing) {
      const topics = existing.topics_explored || [];
      if (topic && !topics.includes(topic)) {
        topics.push(topic);
      }

      await supabase
        .from('ai_study_analytics')
        .update({
          total_queries: existing.total_queries + 1,
          topics_explored: topics,
          last_query_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('ai_study_analytics')
        .insert({
          student_id: studentId,
          session_id: normalizedSessionId,
          total_queries: 1,
          topics_explored: topic ? [topic] : [],
          last_query_at: new Date().toISOString(),
        });
    }
  } catch (error) {
    logger.warn('Error updating study analytics', { error: error.message });
  }
}

module.exports = router;

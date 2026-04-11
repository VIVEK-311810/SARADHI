const { Worker } = require('bullmq');
const { connection } = require('../queues');
const logger = require('../logger');

// Lazy-load heavy services so this module is safe to require even when Redis is absent
let _vectorizeResource, _summarizeResource, _handleAiSearchJob, _generateProjectSuggestions;

function getVectorizeFns() {
  if (!_vectorizeResource) {
    ({ vectorizeResource: _vectorizeResource, summarizeResource: _summarizeResource } = require('../routes/resources'));
  }
  return { vectorizeResource: _vectorizeResource, summarizeResource: _summarizeResource };
}

function getAiSearchFn() {
  if (!_handleAiSearchJob) {
    ({ handleAiSearchJob: _handleAiSearchJob } = require('../routes/ai-search'));
  }
  return _handleAiSearchJob;
}

function getProjectSuggestionsFn() {
  if (!_generateProjectSuggestions) {
    ({ generateProjectSuggestions: _generateProjectSuggestions } = require('../services/projectSuggestionService'));
  }
  return _generateProjectSuggestions;
}

let vectorizeWorker = null;
let aiSearchWorker = null;
let projectSuggestionsWorker = null;

function startWorkers() {
  if (!connection) {
    logger.warn('aiWorker: Redis not available — workers not started');
    return;
  }

  // BullMQ warns about volatile-lru eviction policy — Redis Cloud free tier
  // uses this by default and it cannot be changed. The warning is cosmetic;
  // suppress it so it doesn't spam logs on every startup.
  const _consoleWarn = console.warn.bind(console);
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Eviction policy')) return;
    _consoleWarn(...args);
  };

  // ── Vectorization worker ──────────────────────────────────────────────────
  // Concurrency 2: process up to 2 files simultaneously (HuggingFace allows this)
  vectorizeWorker = new Worker('vectorize', async (job) => {
    const { resourceId, sessionId, includesSummarize } = job.data;
    logger.info('Worker: starting vectorization', { resourceId, jobId: job.id });

    const { vectorizeResource, summarizeResource } = getVectorizeFns();

    await vectorizeResource(resourceId, sessionId);

    if (includesSummarize) {
      await summarizeResource(resourceId);
    }

    logger.info('Worker: vectorization complete', { resourceId, jobId: job.id });
    return { resourceId, status: 'completed' };
  }, {
    connection,
    concurrency: 2,
    // Retry up to 3 times with exponential backoff (5s, 25s, 125s)
    // Handles transient HuggingFace 503s automatically
  });

  vectorizeWorker.on('failed', (job, err) => {
    logger.error('Vectorize job failed', { jobId: job?.id, resourceId: job?.data?.resourceId, error: err.message });
  });

  vectorizeWorker.on('completed', (job) => {
    logger.info('Vectorize job completed', { jobId: job.id, resourceId: job.data.resourceId });
  });

  // ── AI Search worker ──────────────────────────────────────────────────────
  // Concurrency 5: each search takes 2-10s, allow 5 parallel
  aiSearchWorker = new Worker('ai-search', async (job) => {
    const { jobId, sessionId, query, top_k, userId, classificationType } = job.data;
    logger.info('Worker: starting AI search', { jobId, sessionId });

    const handleAiSearchJob = getAiSearchFn();
    const result = await handleAiSearchJob({ sessionId, query, top_k, userId, classificationType });

    logger.info('Worker: AI search complete', { jobId, sessionId, type: result.type });
    return result;
  }, {
    connection,
    concurrency: 5,
  });

  aiSearchWorker.on('failed', (job, err) => {
    logger.error('AI search job failed', { jobId: job?.id, error: err.message });
  });

  // ── Project suggestions worker ────────────────────────────────────────────
  // Concurrency 1: LLM generation is heavy; no need to parallelise
  projectSuggestionsWorker = new Worker('project-suggestions', async (job) => {
    const { numericSessionId, stringSessionId, hint } = job.data;
    logger.info('Worker: starting project suggestions', { numericSessionId, jobId: job.id });

    const generateProjectSuggestions = getProjectSuggestionsFn();
    const suggestions = await generateProjectSuggestions(numericSessionId, hint || null);

    // Broadcast readiness to all session participants via the global WS helper
    if (global.broadcastToSession && stringSessionId) {
      try {
        await global.broadcastToSession(stringSessionId.toUpperCase(), {
          type: 'project-suggestions-ready',
          sessionId: stringSessionId,
          count: suggestions.length,
        });
      } catch (e) {
        logger.warn('Project suggestions broadcast failed (non-fatal)', { error: e.message });
      }
    }

    logger.info('Worker: project suggestions complete', { numericSessionId, count: suggestions.length });
    return { numericSessionId, count: suggestions.length, status: 'completed' };
  }, {
    connection,
    concurrency: 1,
  });

  projectSuggestionsWorker.on('failed', async (job, err) => {
    logger.error('Project suggestions job failed', { jobId: job?.id, sessionId: job?.data?.numericSessionId, error: err.message });
    // Mark as failed in DB so the frontend can show a retry button
    if (job?.data?.numericSessionId) {
      try {
        const pool = require('../db');
        await pool.query(
          `UPDATE session_projects SET generation_status = 'failed', generation_error = $1, updated_at = NOW()
           WHERE session_id = $2`,
          [err.message, job.data.numericSessionId]
        );
      } catch (_) {}
    }
  });

  projectSuggestionsWorker.on('completed', (job) => {
    logger.info('Project suggestions job completed', { jobId: job.id, sessionId: job.data.numericSessionId });
  });

  logger.info('BullMQ workers started (vectorize ×2, ai-search ×5, project-suggestions ×1)');
}

function stopWorkers() {
  return Promise.all([
    vectorizeWorker?.close(),
    aiSearchWorker?.close(),
    projectSuggestionsWorker?.close(),
  ]);
}

module.exports = { startWorkers, stopWorkers };

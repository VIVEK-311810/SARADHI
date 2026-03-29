const { Worker } = require('bullmq');
const { connection } = require('../queues');
const logger = require('../logger');

// Lazy-load heavy services so this module is safe to require even when Redis is absent
let _vectorizeResource, _summarizeResource, _handleAiSearchJob;

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

let vectorizeWorker = null;
let aiSearchWorker = null;

function startWorkers() {
  if (!connection) {
    logger.warn('aiWorker: Redis not available — workers not started');
    return;
  }

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

  logger.info('BullMQ workers started (vectorize ×2, ai-search ×5)');
}

function stopWorkers() {
  return Promise.all([
    vectorizeWorker?.close(),
    aiSearchWorker?.close(),
  ]);
}

module.exports = { startWorkers, stopWorkers };

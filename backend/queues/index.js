const { Queue } = require('bullmq');
const logger = require('../logger');

const REDIS_URL = process.env.REDIS_URL;

// BullMQ requires ioredis connection options, not a URL string directly
function parseRedisUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port) || 6379,
      username: u.username || undefined,
      password: u.password || undefined,
      tls: u.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null, // required by BullMQ
    };
  } catch {
    return null;
  }
}

const connection = parseRedisUrl(REDIS_URL);

let vectorizeQueue = null;
let aiSearchQueue = null;

if (connection) {
  vectorizeQueue = new Queue('vectorize', { connection });
  aiSearchQueue = new Queue('ai-search', { connection });
  logger.info('BullMQ queues initialised (vectorize, ai-search)');
} else {
  logger.warn('REDIS_URL not set — BullMQ queues disabled, falling back to in-process execution');
}

module.exports = { vectorizeQueue, aiSearchQueue, connection };

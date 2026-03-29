const Redis = require('ioredis');
const logger = require('./logger');

// Graceful no-op when Redis is not configured (local dev without REDIS_URL)
const REDIS_URL = process.env.REDIS_URL;

function createClient(name) {
  if (!REDIS_URL) return null;

  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    // Keep-alive: prevents idle connections from being dropped by Redis Cloud
    keepAlive: 10000,
    // Reconnect with capped exponential backoff (max 10s between retries)
    retryStrategy: (times) => Math.min(times * 500, 10000),
    // Connection name visible in Redis MONITOR / CLIENT LIST
    connectionName: `saradhi-${name}`,
  });

  client.on('error', (err) => {
    // Suppress noisy ETIMEDOUT/ECONNRESET reconnect noise — ioredis retries automatically
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
      logger.debug(`Redis ${name} connection error (retrying)`, { code: err.code });
    } else {
      logger.warn(`Redis ${name} error (non-fatal)`, { error: err.message });
    }
  });

  client.on('connect', () => logger.info(`Redis ${name} connected`));
  client.on('reconnecting', () => logger.debug(`Redis ${name} reconnecting...`));

  return client;
}

// Main client — commands (get/set/hset/etc.)
const redis = createClient('main');

// Pub/Sub requires dedicated connections — cannot share with command client
const redisPub = createClient('pub');
const redisSub = createClient('sub');

// Convenience: returns true if Redis is available and connected
function isRedisAvailable() {
  return redis !== null && redis.status === 'ready';
}

module.exports = { redis, redisPub, redisSub, isRedisAvailable };

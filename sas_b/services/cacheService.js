const logger = require('../logger');

/**
 * Cache service with optional Redis backend.
 * Falls back to in-memory LRU cache if Redis is unavailable.
 * Graceful degradation: cache misses are never errors.
 */
class CacheService {
  constructor() {
    this.redis = null;
    this.memoryCache = new Map();
    this.memoryCacheTimers = new Map();
    this.maxMemoryEntries = 500;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.info('REDIS_URL not set — using in-memory cache');
      return;
    }

    try {
      const Redis = require('ioredis');
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        connectTimeout: 5000,
      });

      await this.redis.connect();
      logger.info('Redis cache connected');

      this.redis.on('error', (err) => {
        logger.warn('Redis error, falling back to memory cache', { error: err.message });
      });
    } catch (error) {
      logger.warn('Redis connection failed, using in-memory cache', { error: error.message });
      this.redis = null;
    }
  }

  /**
   * Get-or-set pattern: returns cached value or computes and caches it
   * @param {string} key - Cache key
   * @param {number} ttlSeconds - Time-to-live in seconds
   * @param {Function} fetchFn - Async function to compute value on miss
   */
  async getOrSet(key, ttlSeconds, fetchFn) {
    try {
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }
    } catch {
      // Cache miss or error — proceed to compute
    }

    const value = await fetchFn();

    // Cache in background — don't block the response
    this.set(key, value, ttlSeconds).catch(() => {});

    return value;
  }

  async get(key) {
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch {
        // Fall through to memory cache
      }
    }

    const entry = this.memoryCache.get(key);
    if (entry) {
      return entry.value;
    }
    return null;
  }

  async set(key, value, ttlSeconds) {
    if (this.redis) {
      try {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        return;
      } catch {
        // Fall through to memory cache
      }
    }

    // In-memory fallback with TTL
    this.memoryCache.set(key, { value });

    // Clear existing timer if any
    if (this.memoryCacheTimers.has(key)) {
      clearTimeout(this.memoryCacheTimers.get(key));
    }

    // Set expiry timer
    const timer = setTimeout(() => {
      this.memoryCache.delete(key);
      this.memoryCacheTimers.delete(key);
    }, ttlSeconds * 1000);
    this.memoryCacheTimers.set(key, timer);

    // Evict oldest entries if over limit
    if (this.memoryCache.size > this.maxMemoryEntries) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
      if (this.memoryCacheTimers.has(firstKey)) {
        clearTimeout(this.memoryCacheTimers.get(firstKey));
        this.memoryCacheTimers.delete(firstKey);
      }
    }
  }

  async invalidate(key) {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Ignore
      }
    }

    this.memoryCache.delete(key);
    if (this.memoryCacheTimers.has(key)) {
      clearTimeout(this.memoryCacheTimers.get(key));
      this.memoryCacheTimers.delete(key);
    }
  }

  /**
   * Invalidate all keys matching a pattern (e.g., "resources:SESSION123*")
   */
  async invalidatePattern(pattern) {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch {
        // Ignore
      }
    }

    // For memory cache, check each key
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(pattern.replace('*', ''))) {
        this.invalidate(key);
      }
    }
  }
}

// Singleton
const cacheService = new CacheService();
module.exports = cacheService;

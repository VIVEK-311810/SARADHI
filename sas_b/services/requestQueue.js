const logger = require('../logger');

/**
 * Simple in-memory concurrency limiter for LLM API calls.
 * Prevents thundering herd when 200+ students query simultaneously.
 */
class RequestQueue {
  constructor(concurrencyLimit = 5) {
    this.concurrencyLimit = concurrencyLimit;
    this.activeCount = 0;
    this.queue = [];
    this.stats = {
      totalProcessed: 0,
      totalQueued: 0,
      totalTimedOut: 0,
    };
  }

  /**
   * Enqueue a function to be executed when a slot is available.
   * @param {Function} fn - Async function to execute
   * @param {number} timeoutMs - Max time to wait in queue (default 30s)
   * @returns {Promise} Result of fn()
   */
  async enqueue(fn, timeoutMs = 30000) {
    // If under the limit, execute immediately
    if (this.activeCount < this.concurrencyLimit) {
      return this.execute(fn);
    }

    // Otherwise, queue and wait
    this.stats.totalQueued++;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex(item => item.id === entry.id);
        if (idx !== -1) this.queue.splice(idx, 1);
        this.stats.totalTimedOut++;
        reject(new Error('AI service is busy. Please try again in a few seconds.'));
      }, timeoutMs);

      const entry = {
        id: Date.now() + Math.random(),
        fn,
        resolve,
        reject,
        timeoutId,
      };

      this.queue.push(entry);
    });
  }

  async execute(fn) {
    this.activeCount++;
    try {
      const result = await fn();
      this.stats.totalProcessed++;
      return result;
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  processNext() {
    if (this.queue.length === 0 || this.activeCount >= this.concurrencyLimit) {
      return;
    }

    const next = this.queue.shift();
    clearTimeout(next.timeoutId);

    this.execute(next.fn)
      .then(next.resolve)
      .catch(next.reject);
  }

  getStats() {
    return {
      ...this.stats,
      activeCount: this.activeCount,
      queueLength: this.queue.length,
    };
  }
}

// Singleton: shared across all routes
module.exports = new RequestQueue(5);

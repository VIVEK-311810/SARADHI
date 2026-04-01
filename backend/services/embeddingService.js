const axios = require('axios');
const logger = require('../logger');

// Batch size: HuggingFace inference accepts arrays; 32 texts per call keeps
// payload size reasonable and avoids 413s on longer chunks.
const BATCH_SIZE = 32;
const BATCH_DELAY_MS = 500; // delay between batches, not between individual chunks

class EmbeddingService {
  constructor() {
    this.apiUrl = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.maxTokens = 512;
    this.retryAttempts = 5;
  }

  // Single-text embedding — used for query embedding during search
  async generateEmbedding(text, retryCount = 0) {
    if (!text || text.trim().length === 0) {
      throw new Error('Empty text provided for embedding generation');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 503 && retryCount < this.retryAttempts) {
        const waitTime = 5000 + (retryCount * 2000);
        logger.debug(`HuggingFace model loading, retrying in ${waitTime}ms`, { attempt: retryCount + 1 });
        await this.sleep(waitTime);
        return this.generateEmbedding(text, retryCount + 1);
      }
      if (error.response?.status === 429 && retryCount < this.retryAttempts) {
        const waitTime = 10000 + (retryCount * 5000);
        logger.debug(`HuggingFace rate limited, retrying in ${waitTime}ms`, { attempt: retryCount + 1 });
        await this.sleep(waitTime);
        return this.generateEmbedding(text, retryCount + 1);
      }
      throw new Error(`Failed to generate embedding: ${error.response?.data?.error || error.message}`);
    }
  }

  // Batch embedding — sends BATCH_SIZE texts per API call instead of one-by-one.
  // 55 chunks → 2 API calls instead of 55. Reduces vectorization from ~110s to ~3s.
  async generateBatchEmbeddings(texts) {
    const embeddings = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await this._embedBatch(batch);
      embeddings.push(...batchEmbeddings);

      logger.info(`Generated embeddings: ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}`);

      // Polite delay between batches only (not between individual texts)
      if (i + BATCH_SIZE < texts.length) {
        await this.sleep(BATCH_DELAY_MS);
      }
    }

    return embeddings;
  }

  async _embedBatch(texts, retryCount = 0) {
    try {
      const response = await axios.post(
        this.apiUrl,
        { inputs: texts, options: { wait_for_model: true } },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // longer timeout for batch
        }
      );

      const result = response.data;
      if (!Array.isArray(result)) {
        throw new Error(`Unexpected HuggingFace response: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (error) {
      if (error.response?.status === 503 && retryCount < this.retryAttempts) {
        const waitTime = 5000 + (retryCount * 2000);
        logger.debug(`HuggingFace model loading (batch), retrying in ${waitTime}ms`, { attempt: retryCount + 1 });
        await this.sleep(waitTime);
        return this._embedBatch(texts, retryCount + 1);
      }
      if (error.response?.status === 429 && retryCount < this.retryAttempts) {
        const waitTime = 10000 + (retryCount * 5000);
        logger.debug(`HuggingFace rate limited (batch), retrying in ${waitTime}ms`, { attempt: retryCount + 1 });
        await this.sleep(waitTime);
        return this._embedBatch(texts, retryCount + 1);
      }
      throw new Error(`Batch embed failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Word-based chunking that treats LaTeX blocks ($$...$$, \begin...\end) and
   * code fences (```...```) as atomic tokens — they are never split across chunks.
   */
  chunkText(text, maxTokens = 512, overlap = 50) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Step 1: extract atomic blocks (equations + code fences) and replace with
    //         single placeholder "words" so the word-splitter keeps them intact.
    const atomics = [];
    const ATOM = '\x00ATOM\x00';

    const safe = text
      .replace(/\$\$[\s\S]+?\$\$/g, m => { atomics.push(m); return `${ATOM}${atomics.length - 1}${ATOM}`; })
      .replace(/\\begin\{[^}]+\}[\s\S]+?\\end\{[^}]+\}/g, m => { atomics.push(m); return `${ATOM}${atomics.length - 1}${ATOM}`; })
      .replace(/```[\s\S]*?```/g, m => { atomics.push(m); return `${ATOM}${atomics.length - 1}${ATOM}`; });

    // Step 2: standard word-based chunking on the placeholder text
    const maxWords = Math.floor(maxTokens * 0.75);
    const overlapWords = Math.floor(overlap * 0.75);
    const words = safe.split(/\s+/).filter(w => w.length > 0);
    const chunks = [];

    let i = 0;
    while (i < words.length) {
      const chunkWords = words.slice(i, i + maxWords);
      // Step 3: restore atomic blocks in each chunk
      const restored = chunkWords.join(' ').replace(
        new RegExp(`${ATOM}(\\d+)${ATOM}`, 'g'),
        (_, idx) => atomics[parseInt(idx)] || ''
      );

      if (restored.trim().length > 0) {
        chunks.push({
          text: restored,
          startIndex: i,
          endIndex: Math.min(i + maxWords, words.length),
          tokenCount: this.estimateTokens(restored),
        });
      }

      i += maxWords - overlapWords;
    }

    return chunks;
  }

  estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new EmbeddingService();

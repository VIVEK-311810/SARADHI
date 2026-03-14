const axios = require('axios');

class EmbeddingService {
  constructor() {
    this.apiUrl = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.maxTokens = 512; // Model limit
    this.retryAttempts = 5; // Increased from 3 to 5
    this.lastRequestTime = 0; // Track last request time for rate limiting
    this.minRequestInterval = 1000; // Minimum 1 second between requests
  }

  async generateEmbedding(text, retryCount = 0) {
    if (!text || text.trim().length === 0) {
      throw new Error('Empty text provided for embedding generation');
    }

    // Enforce minimum interval between requests to avoid rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }

    try {
      this.lastRequestTime = Date.now();

      const response = await axios.post(
        this.apiUrl,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30s timeout (account for cold start)
        }
      );

      return response.data; // 384-dimensional vector
    } catch (error) {
      // Handle model loading (503 error)
      if (error.response?.status === 503 && retryCount < this.retryAttempts) {
        const waitTime = 5000 + (retryCount * 2000); // Exponential backoff
        console.log(`Model is loading, waiting ${waitTime/1000} seconds... (attempt ${retryCount + 1}/${this.retryAttempts})`);
        await this.sleep(waitTime);
        return this.generateEmbedding(text, retryCount + 1);
      }

      // Handle rate limiting (429 error)
      if (error.response?.status === 429 && retryCount < this.retryAttempts) {
        const waitTime = 10000 + (retryCount * 5000); // Exponential backoff
        console.log(`Rate limited, waiting ${waitTime/1000} seconds... (attempt ${retryCount + 1}/${this.retryAttempts})`);
        await this.sleep(waitTime);
        return this.generateEmbedding(text, retryCount + 1);
      }

      console.error('Embedding generation error:', error.response?.data || error.message);
      throw new Error(`Failed to generate embedding: ${error.response?.data?.error || error.message}`);
    }
  }

  async generateBatchEmbeddings(texts) {
    const embeddings = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];

      try {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);

        // Progress logging
        if ((i + 1) % 10 === 0 || i === texts.length - 1) {
          console.log(`Generated embeddings: ${i + 1}/${texts.length}`);
        }

        // Rate limiting: wait 100ms between requests
        await this.sleep(100);
      } catch (error) {
        console.error(`Error generating embedding for chunk ${i}:`, error.message);
        throw error;
      }
    }

    return embeddings;
  }

  chunkText(text, maxTokens = 512, overlap = 50) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Simple word-based chunking (approximate tokens)
    // 1 token ≈ 0.75 words (English average)
    const maxWords = Math.floor(maxTokens * 0.75);
    const overlapWords = Math.floor(overlap * 0.75);

    const words = text.split(/\s+/).filter(word => word.length > 0);
    const chunks = [];

    let i = 0;
    while (i < words.length) {
      const chunkWords = words.slice(i, i + maxWords);
      const chunk = chunkWords.join(' ');

      if (chunk.trim().length > 0) {
        chunks.push({
          text: chunk,
          startIndex: i,
          endIndex: Math.min(i + maxWords, words.length),
          tokenCount: this.estimateTokens(chunk)
        });
      }

      i += maxWords - overlapWords; // Move forward with overlap
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

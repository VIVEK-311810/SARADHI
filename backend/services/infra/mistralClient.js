const logger = require('../../logger');

class MistralClient {
  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY;
    this.baseUrl = 'https://api.mistral.ai/v1';
    this.models = {
      large: process.env.MISTRAL_MODEL_LARGE || 'mistral-large-latest',
      small: process.env.MISTRAL_MODEL_SMALL || 'mistral-small-latest',
    };

    // Circuit breaker state
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    this.maxConsecutiveFailures = 5;
    this.circuitResetMs = 60000; // 1 minute
  }

  /**
   * Check if the circuit breaker is open (too many consecutive failures)
   */
  isCircuitOpen() {
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      if (Date.now() < this.circuitOpenUntil) {
        return true;
      }
      // Reset circuit after cooldown
      this.consecutiveFailures = 0;
    }
    return false;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
  }

  recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.circuitOpenUntil = Date.now() + this.circuitResetMs;
      logger.error('Mistral API circuit breaker OPEN — too many consecutive failures', {
        failures: this.consecutiveFailures,
        resetAt: new Date(this.circuitOpenUntil).toISOString()
      });
    }
  }

  /**
   * Non-streaming chat completion
   */
  async chatComplete(model, messages, options = {}) {
    if (this.isCircuitOpen()) {
      throw new Error('Mistral API circuit breaker is open. Service temporarily unavailable.');
    }

    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      top_p: options.topP ?? 0.95,
    };

    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    let lastError;
    const maxRetries = options.retries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeout ?? 60000),
        });

        if (!response.ok) {
          const errorData = await response.text();
          const error = new Error(`Mistral API error ${response.status}: ${errorData}`);
          error.status = response.status;

          // Retry on 429 (rate limit) and 503 (overloaded)
          if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
            const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
            logger.warn(`Mistral API ${response.status}, retrying in ${Math.round(backoff)}ms`, { attempt });
            await this.sleep(backoff);
            lastError = error;
            continue;
          }

          this.recordFailure();
          throw error;
        }

        const data = await response.json();
        this.recordSuccess();

        return {
          content: data.choices[0]?.message?.content || '',
          usage: data.usage,
          model: data.model,
        };
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          lastError = new Error('Mistral API request timed out');
          if (attempt < maxRetries) {
            logger.warn('Mistral API timeout, retrying', { attempt });
            continue;
          }
        }
        lastError = error;
        if (attempt >= maxRetries) break;

        // Don't retry on non-retryable errors
        if (error.status && error.status < 500 && error.status !== 429) {
          break;
        }
      }
    }

    this.recordFailure();
    throw lastError;
  }

  /**
   * Streaming chat completion — returns a ReadableStream of SSE events
   */
  async chatStream(model, messages, options = {}) {
    if (this.isCircuitOpen()) {
      throw new Error('Mistral API circuit breaker is open. Service temporarily unavailable.');
    }

    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      top_p: options.topP ?? 0.95,
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout ?? 120000),
    });

    if (!response.ok) {
      const errorData = await response.text();
      this.recordFailure();
      throw new Error(`Mistral API stream error ${response.status}: ${errorData}`);
    }

    this.recordSuccess();
    return response.body;
  }

  /**
   * Classify a student query intent using Mistral Small (fast + cheap)
   */
  async classifyIntent(query, sessionContext = {}) {
    const systemPrompt = `You are a query classifier for an educational AI assistant. Classify the student's query into exactly one type. Respond with ONLY valid JSON.

Types:
- "list_all": Student wants to see all available resources/files/materials
- "filter_by_topic": Student wants resources about a specific topic
- "summarize_file": Student wants a summary of a specific file
- "specific_file_question": Student asks a question about a specific file
- "explain_concept": Student wants a concept explained (e.g., "explain polymorphism", "what is recursion")
- "generate_quiz": Student wants practice questions or a quiz
- "general_question": Any other question about the course material

Response format:
{"type": "...", "topic": "...", "fileName": "...", "isFollowUp": false}

Rules:
- "topic" should be extracted when relevant (for filter_by_topic, explain_concept, generate_quiz)
- "fileName" should be extracted when a specific file is mentioned (include extension)
- "isFollowUp" should be true if the query references previous context ("it", "that", "more about this", "can you elaborate")
- For ambiguous queries, prefer "explain_concept" over "general_question" when the student is asking "what is X" or "explain X"`;

    const result = await this.chatComplete(this.models.small, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ], {
      maxTokens: 150,
      temperature: 0.1, // Low temperature for consistent classification
      responseFormat: { type: 'json_object' },
    });

    try {
      return JSON.parse(result.content);
    } catch {
      logger.warn('Failed to parse classification JSON, falling back', { raw: result.content });
      return { type: 'general_question', topic: null, fileName: null, isFollowUp: false };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new MistralClient();

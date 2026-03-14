const mistralClient = require('./mistralClient');
const logger = require('../logger');

class RAGService {
  constructor() {
    this.model = process.env.MISTRAL_MODEL_LARGE || 'mistral-large-latest';
  }

  /**
   * Generate a contextual answer from retrieved chunks using Mistral Large
   */
  async generateAnswer(query, retrievedChunks, options = {}) {
    const { queryType = 'general', conversationHistory = [], mode = 'answer' } = options;

    if (!retrievedChunks || retrievedChunks.length === 0) {
      return {
        answer: 'I could not find any relevant information in the session materials to answer your question.',
        sources: [],
        confidence: 0.0,
        confidenceLabel: 'none',
        suggestedFollowups: [],
      };
    }

    try {
      const context = this.buildContext(retrievedChunks);
      const messages = this.buildMessages(query, context, queryType, conversationHistory, mode);
      const maxTokens = mode === 'explain' ? 4096 : 2048;

      const result = await mistralClient.chatComplete(this.model, messages, { maxTokens });

      const { answer, suggestions } = this.parseResponse(result.content);
      const { score, label } = this.computeConfidence(retrievedChunks);

      return {
        answer: answer || this.fallbackAnswer(retrievedChunks),
        sources: this.formatSources(retrievedChunks),
        confidence: score,
        confidenceLabel: label,
        suggestedFollowups: suggestions,
        usage: result.usage,
      };
    } catch (error) {
      logger.error('RAG generation error', { error: error.message });

      // Fallback: return best matching chunk as answer
      return {
        answer: this.fallbackAnswer(retrievedChunks),
        sources: this.formatSources(retrievedChunks),
        confidence: this.computeConfidence(retrievedChunks).score,
        confidenceLabel: 'low',
        suggestedFollowups: [],
        fallback: true,
      };
    }
  }

  /**
   * Stream a contextual answer — yields SSE-formatted chunks
   * @param {express.Response} res - Express response object for SSE
   */
  async generateAnswerStream(query, retrievedChunks, res, options = {}) {
    const { queryType = 'general', conversationHistory = [], mode = 'answer' } = options;

    if (!retrievedChunks || retrievedChunks.length === 0) {
      this.sendSSE(res, 'token', { text: 'I could not find any relevant information in the session materials to answer your question.' });
      this.sendSSE(res, 'sources', { sources: [], confidence: 0.0, confidenceLabel: 'none' });
      this.sendSSE(res, 'suggestions', { followups: [] });
      return '';
    }

    const context = this.buildContext(retrievedChunks);
    const messages = this.buildMessages(query, context, queryType, conversationHistory, mode);
    const maxTokens = mode === 'explain' ? 4096 : 2048;

    let fullText = '';

    try {
      const stream = await mistralClient.chatStream(this.model, messages, { maxTokens });
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullText += token;
              this.sendSSE(res, 'token', { text: token });
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      // Send sources and suggestions after streaming completes
      const { score, label } = this.computeConfidence(retrievedChunks);
      this.sendSSE(res, 'sources', {
        sources: this.formatSources(retrievedChunks),
        confidence: score,
        confidenceLabel: label,
      });

      // Extract suggestions from the full text if present
      const { suggestions } = this.parseResponse(fullText);
      this.sendSSE(res, 'suggestions', { followups: suggestions });

      return fullText;
    } catch (error) {
      logger.error('RAG stream error', { error: error.message });

      // Send fallback as a single token
      const fallback = this.fallbackAnswer(retrievedChunks);
      this.sendSSE(res, 'token', { text: fallback });
      this.sendSSE(res, 'sources', {
        sources: this.formatSources(retrievedChunks),
        confidence: this.computeConfidence(retrievedChunks).score,
        confidenceLabel: 'low',
      });
      this.sendSSE(res, 'suggestions', { followups: [] });

      return fallback;
    }
  }

  /**
   * Send a Server-Sent Event
   */
  sendSSE(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Build context string from retrieved chunks (no more 1500-char truncation!)
   */
  buildContext(chunks) {
    return chunks
      .map((chunk, idx) => {
        const source = chunk.resource_title || chunk.file_name || 'Unknown';
        const page = chunk.pageNumber ? ` (Page ${chunk.pageNumber})` : '';
        return `[Source ${idx + 1}: ${source}${page}]\n${chunk.text}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Build the messages array for Mistral chat API
   */
  buildMessages(query, context, queryType, conversationHistory, mode) {
    let systemPrompt;

    if (mode === 'explain') {
      systemPrompt = `You are an educational AI tutor at SASTRA University. When explaining a concept, follow this exact structure:

**Definition:** Clear, concise definition in 1-2 sentences.

**How it works:** Explain the mechanism or process in 3-5 sentences.

**Example:** Provide a concrete, relatable example.

**Analogy:** Give an analogy the student can relate to.

**Practice Question:** End with one multiple-choice question (A-D) to test understanding, including the correct answer.

Use the provided course materials as your source. Always cite which document the information comes from. If the materials don't cover the topic, say so clearly.

After your explanation, suggest exactly 3 follow-up questions wrapped in <suggestions>["q1", "q2", "q3"]</suggestions> tags.`;

    } else if (mode === 'summarize') {
      systemPrompt = `You are an AI study assistant at SASTRA University. Summarize the provided content clearly and concisely. Structure your summary as:

**Overview:** 1-2 sentence high-level summary.

**Key Points:**
- Point 1
- Point 2
- (etc.)

**Detailed Summary:** A more thorough explanation of the content.

After your summary, suggest exactly 3 follow-up questions wrapped in <suggestions>["q1", "q2", "q3"]</suggestions> tags.`;

    } else {
      systemPrompt = `You are an AI study assistant for SASTRA University. Your job is to help students learn by answering their questions using the provided course materials.

Rules:
- Answer ONLY based on the provided context. Do not make up information.
- If the context doesn't contain the answer, say: "I couldn't find this in your course materials."
- Always cite which document and section your answer comes from using [Source N] references.
- Keep answers clear, educational, and appropriate for university students.
- For factual questions, be precise. For conceptual questions, explain thoroughly.

After your answer, suggest exactly 3 follow-up questions the student might want to ask, wrapped in <suggestions>["q1", "q2", "q3"]</suggestions> tags.`;
    }

    const messages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history for follow-ups (last 5 turns)
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10); // Last 5 pairs (10 messages)
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add the current query with context
    messages.push({
      role: 'user',
      content: `Here are the relevant sections from the course materials:\n\n${context}\n\n---\n\nStudent's question: ${query}`
    });

    return messages;
  }

  /**
   * Parse response to extract answer text and suggestions
   */
  parseResponse(text) {
    let answer = text;
    let suggestions = [];

    // Extract suggestions from <suggestions> tags
    const suggestionsMatch = text.match(/<suggestions>\s*(\[[\s\S]*?\])\s*<\/suggestions>/);
    if (suggestionsMatch) {
      try {
        suggestions = JSON.parse(suggestionsMatch[1]);
        // Remove the suggestions tag from the answer
        answer = text.replace(/<suggestions>[\s\S]*?<\/suggestions>/, '').trim();
      } catch {
        // Keep suggestions empty if parsing fails
      }
    }

    return { answer, suggestions };
  }

  /**
   * Compute real confidence based on semantic similarity scores of retrieved chunks
   */
  computeConfidence(chunks) {
    if (!chunks || chunks.length === 0) {
      return { score: 0, label: 'none' };
    }

    // Use average of top 3 chunks' similarity scores
    const topScores = chunks
      .slice(0, 3)
      .map(c => c.similarityScore || 0)
      .filter(s => s > 0);

    if (topScores.length === 0) {
      return { score: 0, label: 'none' };
    }

    const avgScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;

    let label;
    if (avgScore >= 0.6) label = 'high';
    else if (avgScore >= 0.3) label = 'medium';
    else label = 'low';

    return { score: Math.round(avgScore * 100) / 100, label };
  }

  /**
   * Fallback answer when LLM generation fails — returns the most relevant chunk
   */
  fallbackAnswer(retrievedChunks) {
    if (!retrievedChunks || retrievedChunks.length === 0) {
      return 'I could not find any relevant information to answer your question.';
    }

    const topChunk = retrievedChunks[0];
    const source = topChunk.resource_title || topChunk.file_name || 'course materials';
    const snippet = topChunk.text.substring(0, 500) + (topChunk.text.length > 500 ? '...' : '');

    return `*AI generation is temporarily unavailable. Here's the most relevant section from your ${source}:*\n\n${snippet}`;
  }

  /**
   * Format sources for display
   */
  formatSources(retrievedChunks) {
    return retrievedChunks.map(chunk => ({
      resourceId: chunk.resourceId,
      resourceTitle: chunk.resource_title || 'Untitled Resource',
      resourceType: chunk.resource_type,
      fileName: chunk.file_name,
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.section_title || null,
      snippet: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
      similarityScore: chunk.similarityScore,
      fileUrl: chunk.resource_url || null,
    }));
  }
}

module.exports = new RAGService();

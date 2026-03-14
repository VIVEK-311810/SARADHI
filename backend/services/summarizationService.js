const mistralClient = require('./mistralClient');
const logger = require('../logger');

class SummarizationService {
  constructor() {
    this.model = process.env.MISTRAL_MODEL_SMALL || 'mistral-small-latest';
  }

  /**
   * Generate structured summary using Mistral Small
   * No more 3000-char truncation — Mistral handles full documents
   */
  async generateSummary(text, options = {}) {
    if (!text || text.trim().length === 0) {
      return 'No content available for summarization.';
    }

    try {
      // For very long documents, use first ~60K chars (~15K tokens) to stay within limits
      const processedText = text.length > 60000 ? text.substring(0, 60000) : text;

      const result = await mistralClient.chatComplete(this.model, [
        {
          role: 'system',
          content: `You are an educational content summarizer. Create a clear, well-structured summary of the provided document.

Your summary should include:
1. A brief overview (1-2 sentences)
2. Key points as bullet points
3. A more detailed summary paragraph

Keep the summary concise but thorough. Focus on the most important concepts and information that a student would need to know.`
        },
        {
          role: 'user',
          content: `Summarize the following document:\n\n${processedText}`
        }
      ], {
        maxTokens: 1024,
        temperature: 0.3,
      });

      return result.content || this.extractiveSummary(text);
    } catch (error) {
      logger.error('Mistral summarization error', { error: error.message });
      // Fallback to extractive summary
      return this.extractiveSummary(text);
    }
  }

  /**
   * Extractive summary: first N sentences
   * Used as fallback when AI summarization fails
   */
  extractiveSummary(text, sentenceCount = 3) {
    if (!text || text.trim().length === 0) {
      return 'No content available.';
    }

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    if (sentences.length === 0) {
      return text.substring(0, 200).trim() + (text.length > 200 ? '...' : '');
    }

    return sentences.slice(0, sentenceCount).join(' ').trim();
  }

  /**
   * Extract keywords using simple TF-IDF-like approach
   * Used for fast topic filtering without vector search
   */
  extractKeywords(text, topK = 10) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];

    const freq = {};
    words.forEach(word => {
      freq[word] = (freq[word] || 0) + 1;
    });

    const stopwords = new Set([
      'this', 'that', 'with', 'from', 'have', 'been', 'will', 'would',
      'could', 'should', 'about', 'which', 'their', 'there', 'when',
      'where', 'these', 'those', 'they', 'them', 'then', 'than',
      'some', 'such', 'what', 'into', 'also', 'more', 'very', 'much',
      'many', 'most', 'other', 'only', 'just', 'like', 'make', 'made',
      'using', 'used', 'uses', 'each', 'every', 'example', 'examples'
    ]);

    const filtered = Object.entries(freq)
      .filter(([word]) => !stopwords.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([word]) => word);

    return filtered;
  }

  /**
   * Extract topic tags from text
   */
  extractTopicTags(text, keywords) {
    const topicKeywords = {
      'programming': ['code', 'programming', 'function', 'variable', 'algorithm', 'software', 'development'],
      'mathematics': ['equation', 'theorem', 'proof', 'calculus', 'algebra', 'geometry', 'mathematics'],
      'physics': ['force', 'energy', 'motion', 'velocity', 'acceleration', 'physics', 'quantum'],
      'chemistry': ['molecule', 'atom', 'reaction', 'compound', 'element', 'chemistry', 'chemical'],
      'biology': ['cell', 'organism', 'genetics', 'evolution', 'biology', 'biological', 'species'],
      'computer science': ['algorithm', 'data structure', 'complexity', 'computer', 'computational'],
      'machine learning': ['neural', 'training', 'model', 'learning', 'classification', 'regression'],
      'database': ['database', 'query', 'table', 'index', 'transaction', 'relational'],
      'networking': ['network', 'protocol', 'packet', 'router', 'internet', 'communication']
    };

    const lowerText = text.toLowerCase();
    const tags = [];

    for (const [topic, topicWords] of Object.entries(topicKeywords)) {
      const matchCount = topicWords.filter(word =>
        lowerText.includes(word) || keywords.includes(word)
      ).length;

      if (matchCount >= 2) {
        tags.push(topic);
      }
    }

    return tags;
  }
}

module.exports = new SummarizationService();

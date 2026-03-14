const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const mistralClient = require('./mistralClient');
const logger = require('../logger');

class QueryClassifier {
  /**
   * Classify a user query using Mistral AI, with regex fallback
   */
  async classify(query, sessionId) {
    try {
      const result = await mistralClient.classifyIntent(query);
      return {
        type: result.type || 'general_question',
        topic: result.topic || null,
        fileName: result.fileName || null,
        isFollowUp: result.isFollowUp || false,
      };
    } catch (error) {
      logger.warn('Mistral classification failed, using regex fallback', { error: error.message });
      return this.classifyWithRegex(query);
    }
  }

  /**
   * Regex-based fallback classifier (original logic, kept for resilience)
   */
  classifyWithRegex(query) {
    const normalizedQuery = query.toLowerCase().trim();

    // Pattern 1: List all resources
    if (/(?:list|show|display|what|give me).*(?:all|available).*(?:resources?|files?|materials?|documents?)/i.test(normalizedQuery) ||
        /(?:what|which).*(?:resources?|files?|materials?|documents?).*(?:available|uploaded|there)/i.test(normalizedQuery)) {
      return { type: 'list_all', topic: null, fileName: null, isFollowUp: false };
    }

    // Pattern 2: Filter by topic
    const topicMatch = normalizedQuery.match(/(?:resources?|files?|materials?|documents?).*(?:about|on|related to|regarding|concerning|containing|with)\s+(.+)/i);
    if (topicMatch) {
      return { type: 'filter_by_topic', topic: topicMatch[1].trim(), fileName: null, isFollowUp: false };
    }

    // Pattern 3: Summarize specific file
    const summarizeMatch = normalizedQuery.match(/(?:summarize|summary of|give.*summary|what'?s in)\s+(.+\.(?:pdf|docx?|pptx?|txt))/i);
    if (summarizeMatch) {
      return { type: 'summarize_file', topic: null, fileName: summarizeMatch[1].trim(), isFollowUp: false };
    }

    // Pattern 4: Question about specific file
    const fileQuestionMatch = normalizedQuery.match(/(?:in|from|within)\s+(.+\.(?:pdf|docx?|pptx?|txt)).*(?:what|how|why|when|where|explain|tell|describe)/i);
    if (fileQuestionMatch) {
      return { type: 'specific_file_question', topic: null, fileName: fileQuestionMatch[1].trim(), isFollowUp: false };
    }

    // Pattern 5: Explain concept
    if (/^(?:explain|what is|what are|define|describe|tell me about)\s+/i.test(normalizedQuery)) {
      const conceptMatch = normalizedQuery.match(/^(?:explain|what is|what are|define|describe|tell me about)\s+(.+)/i);
      return {
        type: 'explain_concept',
        topic: conceptMatch ? conceptMatch[1].replace(/[?.!]+$/, '').trim() : null,
        fileName: null,
        isFollowUp: false,
      };
    }

    // Pattern 6: Quiz generation
    if (/(?:quiz|test|practice|questions?\s+(?:on|about|from))/i.test(normalizedQuery)) {
      return { type: 'generate_quiz', topic: null, fileName: null, isFollowUp: false };
    }

    // Default: general question
    return { type: 'general_question', topic: null, fileName: null, isFollowUp: false };
  }

  /**
   * Get cached classification or classify and cache the result
   */
  async getCachedOrClassify(query, sessionId) {
    try {
      const hash = crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');

      // Check cache
      const { data: cached, error } = await supabase
        .from('query_classifications')
        .select('*')
        .eq('session_id', sessionId.toUpperCase())
        .eq('query_hash', hash)
        .single();

      if (cached && !error) {
        logger.debug('Using cached classification', { type: cached.query_type });
        return {
          type: cached.query_type,
          ...(cached.extracted_entities || {}),
        };
      }

      // Classify and cache
      const classification = await this.classify(query, sessionId);

      // Store in cache (don't block response)
      supabase
        .from('query_classifications')
        .insert({
          session_id: sessionId.toUpperCase(),
          query_text: query,
          query_hash: hash,
          query_type: classification.type,
          extracted_entities: classification,
        })
        .then(() => {})
        .catch(err => logger.warn('Error caching classification', { error: err.message }));

      logger.info('Query classified', { query: query.substring(0, 50), type: classification.type });
      return classification;
    } catch (error) {
      logger.error('Error in getCachedOrClassify', { error: error.message });
      // Fallback to regex classification without caching
      return this.classifyWithRegex(query);
    }
  }
}

module.exports = new QueryClassifier();

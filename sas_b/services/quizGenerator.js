const mistralClient = require('./mistralClient');
const logger = require('../logger');

class QuizGenerator {
  constructor() {
    this.model = process.env.MISTRAL_MODEL_LARGE || 'mistral-large-latest';
  }

  /**
   * Generate MCQ quiz questions from retrieved context chunks
   * @param {Array} chunks - Retrieved text chunks with metadata
   * @param {string} topic - Optional topic to focus questions on
   * @param {number} count - Number of questions to generate (default 5, max 10)
   * @returns {Array<{question, options, correctAnswer, justification, sourcePage}>}
   */
  async generateFromContext(chunks, topic = null, count = 5) {
    count = Math.min(Math.max(count, 1), 10);

    if (!chunks || chunks.length === 0) {
      throw new Error('No course material available to generate quiz questions.');
    }

    const context = chunks
      .map((chunk, idx) => {
        const source = chunk.resource_title || chunk.file_name || 'Source';
        const page = chunk.pageNumber ? ` (Page ${chunk.pageNumber})` : '';
        return `[${source}${page}]\n${chunk.text}`;
      })
      .join('\n\n---\n\n');

    const topicInstruction = topic
      ? `Focus the questions specifically on the topic: "${topic}".`
      : 'Cover the most important concepts from the provided material.';

    try {
      const result = await mistralClient.chatComplete(this.model, [
        {
          role: 'system',
          content: `You are an educational quiz generator for university students. Generate high-quality multiple-choice questions that test understanding, not just memorization.

Rules:
- Each question must have exactly 4 options labeled A, B, C, D
- Exactly one option must be correct
- Include a brief justification explaining why the correct answer is right
- Questions should range from basic recall to application/analysis
- All questions MUST be based on the provided course material — do not invent facts
- Include the source page number when possible

Respond with ONLY a valid JSON array in this exact format:
[
  {
    "question": "What is...?",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctAnswer": "A",
    "justification": "...",
    "difficulty": "easy|medium|hard"
  }
]`
        },
        {
          role: 'user',
          content: `Generate exactly ${count} multiple-choice questions from the following course material.

${topicInstruction}

Course material:
${context}`
        }
      ], {
        maxTokens: 4096,
        temperature: 0.7,
        responseFormat: { type: 'json_object' },
      });

      const parsed = JSON.parse(result.content);

      // Handle both { questions: [...] } and direct array formats
      const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

      // Validate and clean each question
      return questions
        .filter(q => q.question && q.options && q.correctAnswer)
        .map((q, idx) => ({
          question: q.question,
          options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
          correctAnswer: q.correctAnswer,
          justification: q.justification || '',
          difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
          index: idx,
        }));
    } catch (error) {
      logger.error('Quiz generation error', { error: error.message });
      throw new Error('Failed to generate quiz questions. Please try again.');
    }
  }
}

module.exports = new QuizGenerator();

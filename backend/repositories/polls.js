const pool = require('../db');

/**
 * Get the currently active poll for a session.
 * Returns null if none active.
 * @param {number} numericSessionId
 * @returns {Promise<object|null>}
 */
async function getActivePoll(numericSessionId) {
  const result = await pool.query(
    'SELECT * FROM polls WHERE session_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
    [numericSessionId]
  );
  return result.rows[0] || null;
}

/**
 * Get a poll with its response rows and basic stats.
 * @param {number} pollId
 * @returns {Promise<{ poll: object, responses: object[], stats: object }|null>}
 */
async function getPollWithResponses(pollId) {
  const [pollResult, responseResult] = await Promise.all([
    pool.query('SELECT * FROM polls WHERE id = $1', [pollId]),
    pool.query(`
      SELECT pr.*, u.full_name as student_name, u.register_number
      FROM poll_responses pr
      JOIN users u ON pr.student_id = u.id
      WHERE pr.poll_id = $1
      ORDER BY pr.responded_at ASC
    `, [pollId])
  ]);

  if (pollResult.rows.length === 0) return null;

  const poll = pollResult.rows[0];
  const responses = responseResult.rows;
  const totalResponses = responses.length;
  const correctCount = responses.filter(r => r.is_correct === true).length;
  const optionCounts = {};
  poll.options.forEach((_, index) => {
    optionCounts[index] = responses.filter(r => r.selected_option === index).length;
  });

  return {
    poll,
    responses,
    stats: {
      totalResponses,
      correctResponses: correctCount,
      accuracyRate: totalResponses > 0 ? (correctCount / totalResponses * 100).toFixed(1) : 0,
      optionCounts,
      averageResponseTime: totalResponses > 0
        ? (responses.reduce((sum, r) => sum + (r.response_time || 0), 0) / totalResponses).toFixed(1)
        : 0
    }
  };
}

/**
 * Insert a new poll row and return it.
 * @param {number} numericSessionId
 * @param {string} question
 * @param {string[]} options
 * @param {{ correctAnswer?: number, justification?: string, timeLimit?: number, difficulty?: number }} opts
 * @returns {Promise<object>}
 */
async function createPoll(numericSessionId, question, options, { correctAnswer = null, justification = '', timeLimit = 60, difficulty = 1 } = {}) {
  const safeDifficulty = [1, 2, 3].includes(parseInt(difficulty)) ? parseInt(difficulty) : 1;
  const result = await pool.query(
    'INSERT INTO polls (session_id, question, options, correct_answer, justification, time_limit, is_active, difficulty) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [numericSessionId, question, JSON.stringify(options), correctAnswer, justification, timeLimit, false, safeDifficulty]
  );
  return result.rows[0];
}

/**
 * Close (deactivate) a poll and record closed_at.
 * Returns the updated row or null if not found.
 * @param {number} pollId
 * @returns {Promise<object|null>}
 */
async function closePoll(pollId) {
  const result = await pool.query(
    'UPDATE polls SET is_active = FALSE, closed_at = NOW() WHERE id = $1 RETURNING *',
    [pollId]
  );
  return result.rows[0] || null;
}

module.exports = { getActivePoll, getPollWithResponses, createPoll, closePoll };

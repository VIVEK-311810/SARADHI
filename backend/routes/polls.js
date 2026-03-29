const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate, authorize } = require('../middleware/auth');
const { calculatePoints } = require('./gamification');

// Track in-progress reveals to prevent race-condition double broadcasts
const revealInProgress = new Set();

// Helper: resolve string session_id → numeric id
async function getNumericSessionId(stringSessionId) {
  const result = await pool.query(
    'SELECT id FROM sessions WHERE session_id = $1',
    [stringSessionId.toUpperCase()]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// POST / — Create a new poll (teacher only)
router.post('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id, question, options, correct_answer, justification, time_limit, difficulty } = req.body;

    if (!session_id || !question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Missing required fields or invalid options' });
    }
    if (question.length > 1000) {
      return res.status(400).json({ error: 'Question too long (max 1000 chars)' });
    }
    if (options.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 options allowed' });
    }
    const limit = time_limit || 60;
    if (limit < 10 || limit > 600) {
      return res.status(400).json({ error: 'time_limit must be between 10 and 600 seconds' });
    }

    const numericSessionId = await getNumericSessionId(session_id);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify teacher owns this session — prevents IDOR (teacher creating polls in other sessions)
    const sessionOwnerCheck = await pool.query(
      'SELECT 1 FROM sessions WHERE id = $1 AND teacher_id = $2',
      [numericSessionId, req.user.id]
    );
    if (sessionOwnerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: you do not own this session' });
    }

    const pollDifficulty = [1, 2, 3].includes(parseInt(difficulty)) ? parseInt(difficulty) : 1;
    const result = await pool.query(
      'INSERT INTO polls (session_id, question, options, correct_answer, justification, time_limit, is_active, difficulty) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [numericSessionId, question, JSON.stringify(options), correct_answer, justification, limit, false, pollDifficulty]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:pollId — Get poll by ID
router.get('/:pollId', authenticate, async (req, res) => {
  try {
    const { pollId } = req.params;
    const result = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const poll = { ...result.rows[0] };

    // Students must not see correct_answer or justification while poll is active
    if (req.user.role === 'student' && poll.is_active) {
      delete poll.correct_answer;
      delete poll.justification;
    }

    res.json(poll);
  } catch (error) {
    logger.error('Error fetching poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:pollId/activate — Activate a poll (teacher only)
router.put('/:pollId/activate', authenticate, authorize('teacher'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { pollId } = req.params;

    await client.query('BEGIN');

    const pollResult = await client.query(
      `SELECT p.session_id, s.teacher_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
      [pollId]
    );
    if (pollResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Poll not found' });
    }
    if (String(pollResult.rows[0].teacher_id) !== String(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: you do not own this session' });
    }

    const sessionId = pollResult.rows[0].session_id;

    // Deactivate any other active polls in the same session
    await client.query(
      'UPDATE polls SET is_active = FALSE WHERE session_id = $1 AND is_active = TRUE',
      [sessionId]
    );

    // Activate the selected poll and record activated_at
    const result = await client.query(
      'UPDATE polls SET is_active = TRUE, activated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [pollId]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error activating poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /:pollId/close — Close a poll (teacher only)
router.put('/:pollId/close', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId } = req.params;

    // Verify teacher owns this poll's session
    const ownerCheck = await pool.query(
      `SELECT s.teacher_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
      [pollId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    if (String(ownerCheck.rows[0].teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this session' });
    }

    const result = await pool.query(
      'UPDATE polls SET is_active = FALSE WHERE id = $1 RETURNING *',
      [pollId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const sessionQuery = await pool.query(
      'SELECT s.session_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1',
      [pollId]
    );

    if (sessionQuery.rows.length > 0) {
      const sessionIdString = sessionQuery.rows[0].session_id;
      if (global.clearPollTimer) global.clearPollTimer(sessionIdString);
      if (global.broadcastToSession) {
        global.broadcastToSession(sessionIdString.toUpperCase(), {
          type: 'poll-deactivated',
          sessionId: sessionIdString,
          pollId: parseInt(pollId)
        });
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error closing poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:pollId/respond — Submit a poll response (student only)
router.post('/:pollId/respond', authenticate, authorize('student'), async (req, res) => {
  try {
    const { pollId } = req.params;
    const { selected_option, response_time } = req.body;
    // Always use authenticated user's ID — prevents IDOR (student acting as another student)
    const student_id = req.user.id;

    if (selected_option === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check poll exists and is active
    const pollResult = await pool.query(
      'SELECT * FROM polls WHERE id = $1 AND is_active = TRUE',
      [pollId]
    );
    if (pollResult.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found or not active' });
    }

    // Check already responded
    const existingResponse = await pool.query(
      'SELECT id FROM poll_responses WHERE poll_id = $1 AND student_id = $2',
      [pollId, student_id]
    );
    if (existingResponse.rows.length > 0) {
      return res.status(400).json({ error: 'Already responded to this poll' });
    }

    const poll = pollResult.rows[0];

    // Verify student is an active participant in this poll's session
    const participantCheck = await pool.query(
      'SELECT sp.id FROM session_participants sp WHERE sp.session_id = $1 AND sp.student_id = $2 AND sp.is_active = true',
      [poll.session_id, student_id]
    );
    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Student not part of this session' });
    }

    const isCorrect = poll.correct_answer !== null ? selected_option === poll.correct_answer : null;

    // Insert response
    const result = await pool.query(
      'INSERT INTO poll_responses (poll_id, student_id, selected_option, is_correct, response_time) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [pollId, student_id, selected_option, isCorrect, response_time || 0]
    );

    // Check if all participants responded → early reveal (non-blocking)
    checkAndTriggerReveal(poll.session_id, pollId).catch(err =>
      logger.error('Error in checkAndTriggerReveal', { error: err.message })
    );

    // Broadcast live response count to session (non-blocking)
    pool.query('SELECT session_id FROM sessions WHERE id = $1', [poll.session_id])
      .then(async (sessionStrResult) => {
        if (sessionStrResult.rows.length > 0 && global.broadcastToSession) {
          const sessionIdString = sessionStrResult.rows[0].session_id;
          const countResult = await pool.query(
            'SELECT COUNT(*) as count FROM poll_responses WHERE poll_id = $1',
            [pollId]
          );
          global.broadcastToSession(sessionIdString.toUpperCase(), {
            type: 'poll-response-update',
            pollId: parseInt(pollId),
            responseCount: parseInt(countResult.rows[0].count),
            sessionId: sessionIdString
          });
        }
      })
      .catch(err => logger.warn('Failed to broadcast response count update', { error: err.message }));

    // Award gamification points (fire-and-forget — does not block response)
    calculatePoints({
      studentId: student_id,
      pollId: parseInt(pollId),
      sessionId: poll.session_id,
      isCorrect: isCorrect !== null ? isCorrect : false,
      difficulty: poll.difficulty || 1
    }).catch(err => logger.error('Gamification error', { error: err.message }));

    res.status(201).json({ message: 'Response submitted successfully', data: result.rows[0] });
  } catch (error) {
    logger.error('Error submitting poll response', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if all online participants responded → trigger early reveal
// Uses revealInProgress Set to prevent race-condition double reveals
async function checkAndTriggerReveal(sessionId, pollId) {
  // Prevent concurrent reveals for the same poll
  const lockKey = `${sessionId}:${pollId}`;
  if (revealInProgress.has(lockKey)) return;
  revealInProgress.add(lockKey);

  try {
    const onlineParticipants = await pool.query(
      'SELECT COUNT(*) as count FROM session_participants WHERE session_id = $1 AND is_active = true',
      [sessionId]
    );
    const pollResponses = await pool.query(
      'SELECT COUNT(*) as count FROM poll_responses WHERE poll_id = $1',
      [pollId]
    );

    const onlineCount = parseInt(onlineParticipants.rows[0].count);
    const responseCount = parseInt(pollResponses.rows[0].count);

    if (responseCount >= onlineCount && onlineCount > 0) {
      await triggerAnswerReveal(sessionId, pollId);
    }
  } finally {
    revealInProgress.delete(lockKey);
  }
}

async function triggerAnswerReveal(sessionId, pollId) {
  try {
    const pollResult = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (pollResult.rows.length === 0) return;

    const poll = pollResult.rows[0];
    const sessionResult = await pool.query('SELECT session_id FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) return;

    const sessionIdString = sessionResult.rows[0].session_id;
    const normalizedSessionId = sessionIdString.toUpperCase();
    const activePollData = global.activePollEndTimes ? global.activePollEndTimes.get(normalizedSessionId) : null;

    const broadcastFn = global.broadcastPollToSession || global.broadcastToSession;
    if (broadcastFn) {
      await broadcastFn(normalizedSessionId, {
        type: 'reveal-answers',
        sessionId: sessionIdString,
        pollId,
        correctAnswer: poll.correct_answer,
        poll,
        server_time: Date.now(),
        poll_end_time: activePollData ? activePollData.pollEndTime : Date.now(),
        reason: 'all-responded'
      });

      if (global.clearPollTimer) global.clearPollTimer(sessionIdString);
      logger.info('Answer reveal broadcast (all responded)', { pollId, sessionId: sessionIdString });

      // Push stats-updated to students on the dashboard page
      if (global.broadcastToDashboardsForSession) {
        global.broadcastToDashboardsForSession(normalizedSessionId, { type: 'stats-updated' }).catch(() => {});
      }
    }

    // Deactivate poll in DB so late-joiners don't see a finished poll as active
    await pool.query('UPDATE polls SET is_active = FALSE WHERE id = $1', [pollId]);
  } catch (error) {
    logger.error('Error triggering answer reveal', { error: error.message });
  }
}

// GET /:pollId/responses — Get poll responses with stats (teacher who owns session only)
router.get('/:pollId/responses', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId } = req.params;

    // Verify teacher owns this poll's session — prevents IDOR (PII leak of student names)
    const ownerCheck = await pool.query(
      `SELECT s.teacher_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
      [pollId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    if (String(ownerCheck.rows[0].teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this session' });
    }

    const result = await pool.query(`
      SELECT pr.*, u.full_name as student_name, u.register_number
      FROM poll_responses pr
      JOIN users u ON pr.student_id = u.id
      WHERE pr.poll_id = $1
      ORDER BY pr.responded_at ASC
    `, [pollId]);

    const pollResult = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (pollResult.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const poll = pollResult.rows[0];
    const responses = result.rows;
    const totalResponses = responses.length;
    const correctCount = responses.filter(r => r.is_correct === true).length;
    const optionCounts = {};
    poll.options.forEach((_, index) => {
      optionCounts[index] = responses.filter(r => r.selected_option === index).length;
    });

    res.json({
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
    });
  } catch (error) {
    logger.error('Error fetching poll responses', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:pollId/stats — Poll statistics
router.get('/:pollId/stats', authenticate, async (req, res) => {
  const { pollId } = req.params;
  try {
    const { rows } = await pool.query(`
      WITH session_students AS (
        SELECT sp.student_id FROM session_participants sp
        JOIN polls p ON sp.session_id = p.session_id
        WHERE p.id = $1 AND sp.is_active = true
      ),
      responses AS (
        SELECT pr.student_id, pr.is_correct, pr.responded_at
        FROM poll_responses pr WHERE pr.poll_id = $1
      ),
      first_correct AS (
        SELECT student_id FROM responses
        WHERE is_correct = true ORDER BY responded_at ASC LIMIT 1
      )
      SELECT
        (SELECT COUNT(*) FROM session_students) AS total_students,
        (SELECT COUNT(*) FROM responses) AS answered,
        (SELECT COUNT(*) FROM session_students) - (SELECT COUNT(*) FROM responses) AS not_answered,
        ROUND((COUNT(CASE WHEN is_correct = true THEN 1 END)::DECIMAL / NULLIF(COUNT(*),0)) * 100, 2) AS correct_percentage,
        (SELECT student_id FROM first_correct) AS first_correct_student_id
      FROM responses
    `, [pollId]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('Error fetching poll stats', { error: err.message });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// DELETE /:pollId — Delete a poll (teacher only)
router.delete('/:pollId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId } = req.params;

    // Verify teacher owns this poll's session
    const pollCheck = await pool.query(
      `SELECT p.is_active, s.teacher_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
      [pollId]
    );
    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    if (String(pollCheck.rows[0].teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this session' });
    }
    if (pollCheck.rows[0].is_active === true) {
      return res.status(400).json({ error: 'Cannot delete active poll' });
    }

    const responseCheck = await pool.query(
      'SELECT COUNT(*) as count FROM poll_responses WHERE poll_id = $1', [pollId]
    );
    if (parseInt(responseCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete poll with existing responses' });
    }

    await pool.query('DELETE FROM polls WHERE id = $1', [pollId]);
    res.json({ message: 'Poll deleted successfully' });
  } catch (error) {
    logger.error('Error deleting poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:pollId — Update poll (teacher only, must own session, inactive polls only)
router.put('/:pollId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId } = req.params;
    const { question, options, correct_answer, justification, time_limit, difficulty } = req.body;

    // Input validation
    if (!question || !question.trim() || question.length > 1000) {
      return res.status(400).json({ error: 'Question is required (max 1000 characters)' });
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
      return res.status(400).json({ error: 'Options must be an array of 2–6 items' });
    }
    if (time_limit !== undefined && (time_limit < 10 || time_limit > 600)) {
      return res.status(400).json({ error: 'time_limit must be between 10 and 600 seconds' });
    }

    // Verify poll exists and teacher owns its session
    const pollCheck = await pool.query(
      `SELECT p.is_active, s.teacher_id
       FROM polls p JOIN sessions s ON p.session_id = s.id
       WHERE p.id = $1`,
      [pollId]
    );
    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    if (String(pollCheck.rows[0].teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Access denied: you do not own this poll\'s session' });
    }
    if (pollCheck.rows[0].is_active === true) {
      return res.status(400).json({ error: 'Can only edit inactive polls' });
    }

    const updatedDifficulty = [1, 2, 3].includes(parseInt(difficulty)) ? parseInt(difficulty) : undefined;
    const result = await pool.query(
      `UPDATE polls SET question = $1, options = $2, correct_answer = $3, justification = $4,
        time_limit = $5, difficulty = COALESCE($7, difficulty), updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [question, JSON.stringify(options), correct_answer, justification, time_limit, pollId, updatedDifficulty || null]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

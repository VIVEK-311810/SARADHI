const express = require('express');
const router = express.Router();
const pool = require('../../db');
const logger = require('../../logger');
const { authenticate, authorize } = require('../../middleware/auth');
const { aiLimiter } = require('../../middleware/rateLimiter');
const { awardSessionCompletionPoints, processSessionEndXP, generateSessionSummaries } = require('../analytics/gamification');
const { getNumericSessionId } = require('../helpers/sessionHelpers');

// POST / — Create a new session (teacher only)
router.post('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { title, course_name, subject } = req.body;
    const teacher_id = req.user.id; // Always use authenticated user — prevents IDOR
    if (!title || !course_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate a unique 6-character alphanumeric session code (retry on collision)
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let sessionCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      sessionCode = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
      const existing = await pool.query('SELECT 1 FROM sessions WHERE session_id = $1', [sessionCode]);
      if (existing.rows.length === 0) break;
    }

    const result = await pool.query(
      'INSERT INTO sessions (session_id, title, course_name, teacher_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [sessionCode, title, course_name, teacher_id, true]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /teacher/:teacherId — Get paginated sessions for a teacher
// Query params: ?page=1&limit=20 (default page=1, limit=20, max limit=100)
router.get('/teacher/:teacherId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own sessions.' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [result, countResult] = await Promise.all([
      pool.query(`
        SELECT
          s.*,
          COALESCE(participant_counts.participant_count, 0) as participant_count,
          COALESCE(poll_counts.poll_count, 0) as poll_count
        FROM sessions s
        LEFT JOIN (
          SELECT session_id, COUNT(*) as participant_count
          FROM session_participants GROUP BY session_id
        ) participant_counts ON s.id = participant_counts.session_id
        LEFT JOIN (
          SELECT session_id, COUNT(*) as poll_count FROM polls GROUP BY session_id
        ) poll_counts ON s.id = poll_counts.session_id
        WHERE s.teacher_id = $1
        ORDER BY s.created_at DESC
        LIMIT $2 OFFSET $3
      `, [teacherId, limit, offset]),
      pool.query('SELECT COUNT(*) as total FROM sessions WHERE teacher_id = $1', [teacherId])
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      sessions: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('Error fetching teacher sessions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId — Get a single session by session_id
router.get('/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      `SELECT s.*, u.full_name AS teacher_name
       FROM sessions s
       JOIN users u ON s.teacher_id = u.id
       WHERE s.session_id = $1`,
      [sessionId.toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:sessionId/join — Student joins a session
router.post('/:sessionId/join', authenticate, authorize('student'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const student_id = req.user.id; // Always use authenticated user — prevents IDOR

    const sessionResult = await pool.query(
      'SELECT id, session_id, title, course_name, is_active, is_live, locked_at, lock_after_minutes, live_started_at FROM sessions WHERE session_id = $1',
      [sessionId.toUpperCase()]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    if (!session.is_active) {
      return res.status(403).json({ error: 'Session is not active' });
    }
    if (!session.is_live) {
      return res.status(403).json({ error: 'Class is not live yet. Wait for your teacher to start the class.' });
    }

    // Check if returning participant FIRST — returning students bypass lock
    const existing = await pool.query(
      'SELECT * FROM session_participants WHERE session_id = $1 AND student_id = $2',
      [session.id, student_id]
    );
    const isReturning = existing.rows.length > 0;
    if (isReturning) {
      return res.status(200).json({
        message: 'Already joined session',
        session: { id: session.id, session_id: session.session_id, title: session.title, course_name: session.course_name, is_active: session.is_active, is_live: session.is_live }
      });
    }

    // Lock check: only applies to first-time joiners
    const autoLocked = session.lock_after_minutes && session.live_started_at &&
      (Date.now() - new Date(session.live_started_at).getTime()) / 60000 > session.lock_after_minutes;
    if (session.locked_at || autoLocked) {
      return res.status(403).json({ error: 'Session is locked. New students cannot join at this time.' });
    }

    await pool.query(
      'INSERT INTO session_participants (session_id, student_id) VALUES ($1, $2)',
      [session.id, student_id]
    );

    res.status(201).json({
      message: 'Successfully joined session',
      session: { id: session.id, session_id: session.session_id, title: session.title, course_name: session.course_name, is_active: session.is_active, is_live: session.is_live }
    });
  } catch (error) {
    logger.error('Error joining session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId/participants — Get session participants
router.get('/:sessionId/participants', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await pool.query(`
      WITH response_stats AS (
        SELECT
          pr.student_id,
          COALESCE(SUM(pr.tab_switches), 0)::int AS total_tab_switches,
          COUNT(pr.id)::int AS polls_answered
        FROM poll_responses pr
        JOIN polls p ON pr.poll_id = p.id
        WHERE p.session_id = $1
        GROUP BY pr.student_id
      )
      SELECT
        sp.student_id AS id,
        u.full_name AS name,
        u.email,
        sp.joined_at,
        sp.is_active,
        COALESCE(rs.total_tab_switches, 0)::int AS total_tab_switches,
        COALESCE(rs.polls_answered, 0)::int AS polls_answered
      FROM session_participants sp
      JOIN users u ON sp.student_id = u.id
      LEFT JOIN response_stats rs ON rs.student_id = sp.student_id
      WHERE sp.session_id = $1
      ORDER BY sp.joined_at DESC
    `, [numericSessionId]);

    res.json({ participants: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching participants', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId/active-poll — Get active poll with synchronized timestamps
router.get('/:sessionId/active-poll', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await pool.query(
      'SELECT * FROM polls WHERE session_id = $1 AND is_active = TRUE ORDER BY activated_at DESC LIMIT 1',
      [numericSessionId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active poll found' });
    }

    const poll = result.rows[0];
    const serverTime = Date.now();
    const activePollData = global.activePollEndTimes ? global.activePollEndTimes.get(sessionId.toUpperCase()) : null;

    let pollEndTime;
    if (activePollData && activePollData.pollId === poll.id) {
      pollEndTime = activePollData.pollEndTime;
    } else if (poll.ends_at) {
      pollEndTime = new Date(poll.ends_at).getTime();
    } else {
      const activatedAt = new Date(poll.activated_at).getTime();
      pollEndTime = activatedAt + (poll.time_limit || 60) * 1000;
    }

    if (pollEndTime <= serverTime) {
      return res.status(404).json({ error: 'No active poll found' });
    }

    res.json({ ...poll, poll_end_time: pollEndTime, server_time: serverTime });
  } catch (error) {
    logger.error('Error fetching active poll', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId/polls — Get all polls for a session
router.get('/:sessionId/polls', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await pool.query(
      'SELECT * FROM polls WHERE session_id = $1 ORDER BY created_at DESC',
      [numericSessionId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching polls', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId/generated-mcqs — Get generated MCQs for a session
router.get('/:sessionId/generated-mcqs', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await pool.query(
      'SELECT * FROM generated_mcqs WHERE session_id = $1 AND sent_to_students = FALSE ORDER BY created_at DESC',
      [numericSessionId]
    );
    res.json({ mcqs: result.rows });
  } catch (error) {
    logger.error('Error fetching generated MCQs', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:sessionId/live — Teacher starts or ends the live class
router.patch('/:sessionId/live', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { live } = req.body;

    if (typeof live !== 'boolean') {
      return res.status(400).json({ error: 'live must be a boolean' });
    }

    const result = await pool.query(
      `UPDATE sessions
       SET is_live         = $1,
           live_started_at = CASE WHEN $1 = TRUE  THEN CURRENT_TIMESTAMP ELSE live_started_at END,
           live_ended_at   = CASE WHEN $1 = FALSE THEN CURRENT_TIMESTAMP ELSE live_ended_at   END
       WHERE session_id = $2 AND teacher_id = $3
       RETURNING *`,
      [live, sessionId.toUpperCase(), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    // Broadcast to students on session page AND to students on the dashboard
    const wsMessage = { type: live ? 'class-started' : 'class-ended', sessionId: sessionId.toUpperCase() };
    if (global.broadcastToSession) {
      global.broadcastToSession(sessionId.toUpperCase(), wsMessage);
    }
    if (global.broadcastToDashboardsForSession) {
      global.broadcastToDashboardsForSession(sessionId.toUpperCase(), wsMessage);
    }

    logger.info(`Class ${live ? 'started' : 'ended'}`, { sessionId: sessionId.toUpperCase(), teacherId: req.user.id });
    res.json({ success: true, is_live: live, session: result.rows[0] });
  } catch (error) {
    logger.error('Error toggling class live status', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId/notes — Polling fallback for notes generation status
router.get('/:sessionId/notes', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      'SELECT notes_status, notes_url, notes_generated_at, notes_error FROM sessions WHERE session_id = $1',
      [sessionId.toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const { notes_status, notes_url, notes_generated_at, notes_error } = result.rows[0];
    res.json({ status: notes_status || 'none', url: notes_url, generatedAt: notes_generated_at, error: notes_error });
  } catch (error) {
    logger.error('Error fetching notes status', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:sessionId/generate-notes — Teacher manually triggers class notes generation
router.post('/:sessionId/generate-notes', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { selectedResourceIds } = req.body || {};

    const numericId = await getNumericSessionId(sessionId);
    if (numericId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionRes = await pool.query(
      `SELECT id, session_id, title, course_name, teacher_id, live_started_at, live_ended_at, notes_status
       FROM sessions WHERE id = $1`,
      [numericId]
    );
    const session = sessionRes.rows[0];

    if (session.notes_status === 'generating') {
      return res.status(409).json({ error: 'Notes generation already in progress' });
    }

    // Set status to generating (notes_error reset separately to handle missing column gracefully)
    await pool.query(`UPDATE sessions SET notes_status = 'generating' WHERE id = $1`, [numericId]);
    await pool.query(`UPDATE sessions SET notes_error = NULL WHERE id = $1`, [numericId]).catch(() => {});

    const notesGenerator = require('../../services/content/notesGeneratorService');
    const options = Array.isArray(selectedResourceIds) && selectedResourceIds.length > 0
      ? { selectedResourceIds }
      : {};
    notesGenerator.generateNotesAsync(session, options).catch(err =>
      logger.error('Manual notes generation failed', { error: err.message, sessionId: sessionId.toUpperCase() })
    );

    res.json({ success: true, status: 'generating' });
  } catch (error) {
    logger.error('Error starting notes generation', { error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /:sessionId/cancel-notes — Teacher cancels / resets notes generation
router.post('/:sessionId/cancel-notes', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    await pool.query(
      `UPDATE sessions SET notes_status = 'none', notes_error = NULL WHERE session_id = $1 AND teacher_id = $2`,
      [sessionId.toUpperCase(), req.user.id]
    );
    res.json({ success: true, status: 'none' });
  } catch (error) {
    logger.error('Error cancelling notes generation', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:sessionId/lock — Teacher locks/unlocks session to prevent new joiners
router.patch('/:sessionId/lock', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { locked } = req.body;

    if (typeof locked !== 'boolean') {
      return res.status(400).json({ error: 'locked must be a boolean' });
    }

    const result = await pool.query(
      `UPDATE sessions
       SET locked_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END
       WHERE session_id = $2 AND teacher_id = $3
       RETURNING id, session_id, locked_at`,
      [locked, sessionId.toUpperCase(), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    logger.info(`Session ${locked ? 'locked' : 'unlocked'}`, { sessionId: sessionId.toUpperCase(), teacherId: req.user.id });
    res.json({ success: true, locked: !!result.rows[0].locked_at, locked_at: result.rows[0].locked_at });
  } catch (error) {
    logger.error('Error toggling session lock', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:sessionId/generate-summary — AI-generate a post-class session summary (teacher only)
router.post('/:sessionId/generate-summary', authenticate, authorize('teacher'), aiLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // IDOR: verify teacher owns this session; also grab current summary_status
    const ownerCheck = await pool.query(
      'SELECT id, summary_status FROM sessions WHERE id=$1 AND teacher_id=$2',
      [numericSessionId, req.user.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prevent double-fire if already in progress
    if (ownerCheck.rows[0].summary_status === 'generating') {
      return res.status(409).json({ error: 'Summary generation already in progress' });
    }

    // Mark as generating
    await pool.query(
      `UPDATE sessions SET summary_status='generating' WHERE id=$1`,
      [numericSessionId]
    );

    // Run async — don't block response
    const sessionSummaryService = require('../../services/content/sessionSummaryService');
    sessionSummaryService.generateSessionSummary(numericSessionId)
      .catch(err => {
        logger.error('Session summary generation failed', { error: err.message, sessionId: numericSessionId });
        pool.query(`UPDATE sessions SET summary_status='failed' WHERE id=$1`, [numericSessionId]).catch(() => {});
      });

    res.json({ success: true, status: 'generating' });
  } catch (error) {
    logger.error('Error starting session summary', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:sessionId/summary — Get AI session summary (teacher only)
router.get('/:sessionId/summary', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      `SELECT summary_text, summary_status, summary_generated_at
       FROM sessions WHERE session_id=$1 AND teacher_id=$2`,
      [sessionId.toUpperCase(), req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }
    const { summary_text, summary_status, summary_generated_at } = result.rows[0];
    res.json({
      status: summary_status || 'none',
      summary: summary_text,
      generated_at: summary_generated_at,
    });
  } catch (error) {
    logger.error('Error fetching session summary', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:sessionId — Delete a session (teacher only, must own the session)
router.delete('/:sessionId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericSessionId = await getNumericSessionId(sessionId);
    if (numericSessionId === null) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify ownership — only the session's teacher can delete it
    const result = await pool.query(
      'DELETE FROM sessions WHERE id = $1 AND teacher_id = $2 RETURNING id',
      [numericSessionId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: you do not own this session' });
    }

    // Gamification session-end processing (non-blocking — session already deleted so use pre-capture ID)
    // Note: because session_points use ON DELETE SET NULL, points records persist
    awardSessionCompletionPoints(numericSessionId).catch(err =>
      logger.error('Session completion points error on delete', { error: err.message })
    );
    processSessionEndXP(numericSessionId).catch(err =>
      logger.error('Session end XP error on delete', { error: err.message })
    );

    res.status(200).json({ message: 'Session deleted successfully' });
  } catch (error) {
    logger.error('Error deleting session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

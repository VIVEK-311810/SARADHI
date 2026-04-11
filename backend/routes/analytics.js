const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/analytics/teacher/:teacherId/overview
// Returns overall teaching statistics
router.get('/teacher/:teacherId/overview', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own analytics.' });
    }

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sessions WHERE teacher_id = $1) as total_sessions,
        (SELECT COUNT(*) FROM polls p JOIN sessions s ON p.session_id = s.id WHERE s.teacher_id = $1) as total_polls,
        (SELECT COUNT(DISTINCT sp.student_id)
         FROM session_participants sp
         JOIN sessions s ON sp.session_id = s.id
         WHERE s.teacher_id = $1) as total_students,
        (SELECT ROUND(AVG(CASE WHEN pr.id IS NOT NULL THEN 1 ELSE 0 END) * 100, 1)
         FROM polls p
         JOIN sessions s ON p.session_id = s.id
         LEFT JOIN poll_responses pr ON p.id = pr.poll_id
         WHERE s.teacher_id = $1) as avg_response_rate,
        (SELECT ROUND(AVG(CASE WHEN pr.is_correct THEN 100 ELSE 0 END), 1)
         FROM poll_responses pr
         JOIN polls p ON pr.poll_id = p.id
         JOIN sessions s ON p.session_id = s.id
         WHERE s.teacher_id = $1) as avg_correct_rate
    `, [teacherId]);

    res.json({
      success: true,
      data: {
        totalSessions: parseInt(result.rows[0].total_sessions) || 0,
        totalPolls: parseInt(result.rows[0].total_polls) || 0,
        totalStudents: parseInt(result.rows[0].total_students) || 0,
        avgResponseRate: parseFloat(result.rows[0].avg_response_rate) || 0,
        avgCorrectRate: parseFloat(result.rows[0].avg_correct_rate) || 0
      }
    });
  } catch (error) {
    logger.error('Analytics overview error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/teacher/:teacherId/sessions?page=1&limit=20
// Returns per-session analytics, paginated
router.get('/teacher/:teacherId/sessions', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own analytics.' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [result, countResult] = await Promise.all([
      pool.query(`
        SELECT
          s.id,
          s.session_id,
          s.title,
          s.course_name,
          s.is_active,
          s.created_at,
          COUNT(DISTINCT p.id) as poll_count,
          COUNT(DISTINCT sp.student_id) as participant_count,
          COALESCE(ROUND(AVG(CASE WHEN pr.is_correct THEN 100 ELSE 0 END), 1), 0) as avg_accuracy,
          COUNT(pr.id) as total_responses
        FROM sessions s
        LEFT JOIN polls p ON s.id = p.session_id
        LEFT JOIN session_participants sp ON s.id = sp.session_id
        LEFT JOIN poll_responses pr ON p.id = pr.poll_id
        WHERE s.teacher_id = $1
        GROUP BY s.id, s.session_id, s.title, s.course_name, s.is_active, s.created_at
        ORDER BY s.created_at DESC
        LIMIT $2 OFFSET $3
      `, [teacherId, limit, offset]),
      pool.query('SELECT COUNT(*) as total FROM sessions WHERE teacher_id = $1', [teacherId])
    ]);

    const total = parseInt(countResult.rows[0].total) || 0;

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        title: row.title,
        courseName: row.course_name,
        isActive: row.is_active,
        pollCount: parseInt(row.poll_count) || 0,
        participantCount: parseInt(row.participant_count) || 0,
        avgAccuracy: parseFloat(row.avg_accuracy) || 0,
        totalResponses: parseInt(row.total_responses) || 0,
        createdAt: row.created_at
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + result.rows.length < total
      }
    });
  } catch (error) {
    logger.error('Sessions analytics error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/teacher/:teacherId/poll-performance
// Returns poll performance data for charts
router.get('/teacher/:teacherId/poll-performance', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own analytics.' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const result = await pool.query(`
      SELECT
        p.id as poll_id,
        SUBSTRING(p.question, 1, 50) as question,
        s.title as session_title,
        s.session_id,
        COUNT(pr.id) as total_responses,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) as correct_responses,
        COALESCE(ROUND((COUNT(CASE WHEN pr.is_correct THEN 1 END)::DECIMAL / NULLIF(COUNT(pr.id), 0)) * 100, 1), 0) as accuracy_rate,
        COALESCE(ROUND(AVG(pr.response_time)::DECIMAL / 1000, 1), 0) as avg_response_time_sec,
        p.created_at
      FROM polls p
      JOIN sessions s ON p.session_id = s.id
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id
      WHERE s.teacher_id = $1
      GROUP BY p.id, p.question, s.title, s.session_id, p.created_at
      ORDER BY p.created_at DESC
      LIMIT $2
    `, [teacherId, limit]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        pollId: row.poll_id,
        question: row.question + (row.question.length >= 50 ? '...' : ''),
        sessionTitle: row.session_title,
        sessionId: row.session_id,
        question_type: null,
        blooms_level: null,
        subject_tag: null,
        totalResponses: parseInt(row.total_responses) || 0,
        correctResponses: parseInt(row.correct_responses) || 0,
        accuracyRate: parseFloat(row.accuracy_rate) || 0,
        avgResponseTimeSec: parseFloat(row.avg_response_time_sec) || 0,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    logger.error('Poll performance error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/teacher/:teacherId/engagement-trends
// Returns time-series engagement data
router.get('/teacher/:teacherId/engagement-trends', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own analytics.' });
    }
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    const result = await pool.query(`
      SELECT
        DATE(s.created_at) as date,
        COUNT(DISTINCT s.id) as sessions_count,
        COUNT(DISTINCT p.id) as polls_created,
        COUNT(pr.id) as responses_received,
        COALESCE(ROUND(AVG(CASE WHEN pr.is_correct THEN 100 ELSE 0 END), 1), 0) as avg_accuracy
      FROM sessions s
      LEFT JOIN polls p ON s.id = p.session_id
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id
      WHERE s.teacher_id = $1
        AND s.created_at >= NOW() - ($2::int * INTERVAL '1 day')
      GROUP BY DATE(s.created_at)
      ORDER BY date ASC
    `, [teacherId, days]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        date: row.date,
        sessionsCount: parseInt(row.sessions_count) || 0,
        pollsCreated: parseInt(row.polls_created) || 0,
        responsesReceived: parseInt(row.responses_received) || 0,
        avgAccuracy: parseFloat(row.avg_accuracy) || 0
      }))
    });
  } catch (error) {
    logger.error('Engagement trends error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/session/:sessionId/detailed
// Returns detailed analytics for a single session
router.get('/session/:sessionId/detailed', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session info
    const sessionResult = await pool.query(`
      SELECT s.*, u.full_name as teacher_name
      FROM sessions s
      JOIN users u ON s.teacher_id = u.id
      WHERE s.session_id = $1
    `, [sessionId.toUpperCase()]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Ownership check — teachers may only view analytics for their own sessions
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view analytics for your own sessions.' });
    }

    // Get poll breakdown
    const pollsResult = await pool.query(`
      SELECT
        p.id,
        p.question,
        p.options,
        p.correct_answer,
        p.time_limit,
        p.created_at,
        COUNT(pr.id) as response_count,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) as correct_count,
        COALESCE(ROUND(AVG(pr.response_time)::DECIMAL / 1000, 1), 0) as avg_response_time
      FROM polls p
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id
      WHERE p.session_id = $1
      GROUP BY p.id
      ORDER BY p.created_at
    `, [session.id]);

    // Get participant performance
    const participantsResult = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        COUNT(pr.id) as responses_count,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) as correct_count,
        COALESCE(ROUND(AVG(CASE WHEN pr.is_correct THEN 100 ELSE 0 END), 1), 0) as accuracy,
        COALESCE(ROUND(AVG(pr.response_time)::DECIMAL / 1000, 1), 0) as avg_response_time
      FROM session_participants sp
      JOIN users u ON CAST(sp.student_id AS TEXT) = CAST(u.id AS TEXT)
      LEFT JOIN poll_responses pr ON CAST(u.id AS TEXT) = CAST(pr.student_id AS TEXT)
        AND pr.poll_id IN (SELECT id FROM polls WHERE session_id = $1)
      WHERE sp.session_id = $1
      GROUP BY u.id, u.full_name, u.email
      ORDER BY accuracy DESC
    `, [session.id]);

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          sessionId: session.session_id,
          title: session.title,
          courseName: session.course_name,
          teacherName: session.teacher_name,
          isActive: session.is_active,
          createdAt: session.created_at
        },
        pollBreakdown: pollsResult.rows.map(poll => ({
          id: poll.id,
          question: poll.question,
          options: poll.options,
          correctAnswer: poll.correct_answer,
          timeLimit: poll.time_limit,
          responseCount: parseInt(poll.response_count) || 0,
          correctCount: parseInt(poll.correct_count) || 0,
          accuracy: poll.response_count > 0
            ? Math.round((poll.correct_count / poll.response_count) * 100)
            : 0,
          avgResponseTime: parseFloat(poll.avg_response_time) || 0,
          createdAt: poll.created_at
        })),
        participantPerformance: participantsResult.rows.map(p => ({
          id: p.id,
          name: p.full_name,
          email: p.email,
          responsesCount: parseInt(p.responses_count) || 0,
          correctCount: parseInt(p.correct_count) || 0,
          accuracy: parseFloat(p.accuracy) || 0,
          avgResponseTime: parseFloat(p.avg_response_time) || 0
        }))
      }
    });
  } catch (error) {
    logger.error('Session detailed analytics error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

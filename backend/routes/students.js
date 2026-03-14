const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate } = require('../middleware/auth');

// =====================================================
// STUDENT DASHBOARD API ENDPOINTS
// =====================================================

// Authorization helper: student can only access own data; teachers can access any student
function authorizeStudentAccess(req, res, studentId) {
  if (req.user.role === 'student' && req.user.id !== studentId) {
    res.status(403).json({ error: 'Access denied. You can only view your own data.' });
    return false;
  }
  return true;
}

// GET /api/students/:studentId/sessions
// Get student's joined sessions for dashboard
router.get('/:studentId/sessions', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    
    const query = `
      SELECT 
        s.id as session_id,
        s.session_id as join_code,
        s.title,
        s.course_name,
        s.description,
        s.is_active,
        u.full_name as teacher_name,
        sp.joined_at,
        sp.is_active as participation_active,
        -- Count of polls in this session
        (SELECT COUNT(*) FROM polls WHERE session_id = s.id) as total_polls,
        -- Count of active polls
        (SELECT COUNT(*) FROM polls WHERE session_id = s.id AND is_active = true) as active_polls,
        -- Student's response count for this session
        (SELECT COUNT(*) FROM poll_responses pr 
         JOIN polls p ON pr.poll_id = p.id 
         WHERE p.session_id = s.id AND pr.student_id = sp.student_id) as student_responses
      FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      JOIN users u ON s.teacher_id = u.id
      WHERE sp.student_id = $1
      ORDER BY sp.joined_at DESC
    `;
    
    const result = await pool.query(query, [studentId]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching student sessions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:studentId/activity
// Get student's recent activity for activity feed
router.get('/:studentId/activity', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const query = `
      SELECT
        'poll_answered' as activity_type,
        CONCAT('Answered poll in ', s.title) as title,
        pr.responded_at as activity_time,
        CASE WHEN pr.is_correct THEN 'Correct' ELSE 'Incorrect' END as result,
        s.session_id as related_session,
        p.question as poll_question,
        pr.response_time as time_taken
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      JOIN sessions s ON p.session_id = s.id
      WHERE pr.student_id = $1

      UNION ALL

      SELECT 
        'session_joined' as activity_type,
        CONCAT('Joined ', s.title, ' session') as title,
        sp.joined_at as activity_time,
        NULL as result,
        s.session_id as related_session,
        NULL as poll_question,
        NULL as time_taken
      FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE sp.student_id = $1

      ORDER BY activity_time DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [studentId, limit]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching student activity', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:studentId/stats
// Get student statistics for dashboard
router.get('/:studentId/stats', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    
    const query = `
      WITH student_stats AS (
        SELECT 
          -- Sessions joined (all sessions, not just active participation)
          (SELECT COUNT(*) FROM session_participants WHERE student_id = $1) as sessions_joined,
          
          -- Total polls answered
          (SELECT COUNT(*) FROM poll_responses WHERE student_id = $1) as polls_answered,
          
          -- Correct answers
          (SELECT COUNT(*) FROM poll_responses WHERE student_id = $1 AND is_correct = true) as correct_answers,
          
          -- Active sessions (sessions student is in that are currently active)
          (SELECT COUNT(*) 
           FROM session_participants sp 
           JOIN sessions s ON sp.session_id = s.id 
           WHERE sp.student_id = $1 AND s.is_active = true) as active_sessions
      )
      SELECT 
        sessions_joined,
        polls_answered,
        correct_answers,
        active_sessions,
        CASE 
          WHEN polls_answered > 0 THEN ROUND((correct_answers::DECIMAL / polls_answered) * 100, 1)
          ELSE 0 
        END as average_score
      FROM student_stats
    `;
    
    const result = await pool.query(query, [studentId]);
    res.json(result.rows[0] || {
      sessions_joined: 0,
      polls_answered: 0,
      correct_answers: 0,
      active_sessions: 0,
      average_score: 0
    });
  } catch (error) {
    logger.error('Error fetching student stats', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:studentId/active-polls
// Get active polls for student's sessions
router.get('/:studentId/active-polls', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    
    const query = `
      SELECT 
        p.id as poll_id,
        p.question,
        p.options,
        p.time_limit,
        p.created_at,
        p.activated_at,
        s.session_id,
        s.title as session_title,
        -- Check if student has already responded
        CASE WHEN pr.id IS NOT NULL THEN true ELSE false END as already_responded,
        pr.selected_option,
        pr.is_correct,
        pr.responded_at
      FROM polls p
      JOIN sessions s ON p.session_id = s.id
      JOIN session_participants sp ON s.id = sp.session_id
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id AND pr.student_id = sp.student_id
      WHERE sp.student_id = $1
        AND p.is_active = true
      ORDER BY p.activated_at DESC
    `;
    
    const result = await pool.query(query, [studentId]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching active polls', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NOTE: Poll response submission is handled exclusively by POST /api/polls/:pollId/respond
// (in routes/polls.js) which includes gamification point calculation.
// This duplicate endpoint has been removed to prevent bypassing gamification.

// GET /api/students/:studentId/performance
// Get detailed performance analytics
router.get('/:studentId/performance', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    
    const query = `
      SELECT 
        s.session_id,
        s.title as session_title,
        s.course_name,
        COUNT(pr.id) as polls_answered,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) as correct_answers,
        ROUND(
          (COUNT(CASE WHEN pr.is_correct THEN 1 END)::DECIMAL / 
           NULLIF(COUNT(pr.id), 0)) * 100, 1
        ) as accuracy_percentage,
        ROUND(AVG(pr.response_time), 1) as avg_response_time,
        MAX(pr.responded_at) as last_activity
      FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      LEFT JOIN polls p ON s.id = p.session_id
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id AND pr.student_id = sp.student_id
      WHERE sp.student_id = $1
      GROUP BY s.id, s.session_id, s.title, s.course_name
      HAVING COUNT(pr.id) > 0
      ORDER BY last_activity DESC
    `;
    
    const result = await pool.query(query, [studentId]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching student performance', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:studentId/recent-polls
// Get recent polls with responses for review
router.get('/:studentId/recent-polls', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);

    const query = `
      SELECT
        p.id as poll_id,
        p.question,
        p.options,
        p.correct_answer,
        p.justification,
        pr.selected_option,
        pr.is_correct,
        pr.response_time,
        pr.responded_at,
        s.session_id,
        s.title as session_title,
        s.course_name
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      JOIN sessions s ON p.session_id = s.id
      WHERE pr.student_id = $1
      ORDER BY pr.responded_at DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [studentId, limit]);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching recent polls', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// UTILITY ENDPOINTS
// =====================================================

// GET /api/students/:studentId/profile
// Get student profile information
router.get('/:studentId/profile', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    
    const query = `
      SELECT 
        id,
        email,
        full_name,
        register_number,
        department,
        created_at
      FROM users 
      WHERE id = $1 AND role = 'student'
    `;
    
    const result = await pool.query(query, [studentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching student profile', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/:studentId/dashboard-summary
// Get complete dashboard data in one call - FIXED VERSION
router.get('/:studentId/dashboard-summary', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!authorizeStudentAccess(req, res, studentId)) return;
    
    // Get all dashboard data in parallel
    const [sessionsResult, activityResult, statsResult, activePollsResult] = await Promise.all([
      // Sessions - FIXED: Remove the sp.is_active = true condition to show all joined sessions
      pool.query(`
        SELECT
          s.id as session_id,
          s.session_id as join_code,
          s.title,
          s.course_name,
          s.is_active,
          s.is_live,
          u.full_name as teacher_name,
          sp.joined_at,
          sp.is_active as participation_active
        FROM session_participants sp
        JOIN sessions s ON sp.session_id = s.id
        JOIN users u ON s.teacher_id = u.id
        WHERE sp.student_id = $1
        ORDER BY sp.joined_at DESC
        LIMIT 10
      `, [studentId]),
      
      // Recent activity
      pool.query(`
        SELECT 
          'poll_answered' as activity_type,
          CONCAT('Answered poll in ', s.title) as title,
          pr.responded_at as activity_time,
          CASE WHEN pr.is_correct THEN 'Correct' ELSE 'Incorrect' END as result
        FROM poll_responses pr
        JOIN polls p ON pr.poll_id = p.id
        JOIN sessions s ON p.session_id = s.id
        WHERE pr.student_id = $1
        ORDER BY pr.responded_at DESC
        LIMIT 5
      `, [studentId]),
      
      // Stats - FIXED: Count all sessions, not just active participation
      pool.query(`
        WITH student_stats AS (
          SELECT 
            (SELECT COUNT(*) FROM session_participants WHERE student_id = $1) as sessions_joined,
            (SELECT COUNT(*) FROM poll_responses WHERE student_id = $1) as polls_answered,
            (SELECT COUNT(*) FROM poll_responses WHERE student_id = $1 AND is_correct = true) as correct_answers,
            (SELECT COUNT(*) 
             FROM session_participants sp 
             JOIN sessions s ON sp.session_id = s.id 
             WHERE sp.student_id = $1 AND s.is_active = true) as active_sessions
        )
        SELECT 
          sessions_joined,
          polls_answered,
          correct_answers,
          active_sessions,
          CASE 
            WHEN polls_answered > 0 THEN ROUND((correct_answers::DECIMAL / polls_answered) * 100, 1)
            ELSE 0 
          END as average_score
        FROM student_stats
      `, [studentId]),
      
      // Active polls
      pool.query(`
        SELECT 
          p.id as poll_id,
          p.question,
          s.session_id,
          s.title as session_title
        FROM polls p
        JOIN sessions s ON p.session_id = s.id
        JOIN session_participants sp ON s.id = sp.session_id
        WHERE sp.student_id = $1 AND p.is_active = true
        ORDER BY p.activated_at DESC
        LIMIT 3
      `, [studentId])
    ]);
    
    res.json({
      sessions: sessionsResult.rows,
      recentActivity: activityResult.rows,
      stats: statsResult.rows[0] || {
        sessions_joined: 0,
        polls_answered: 0,
        correct_answers: 0,
        active_sessions: 0,
        average_score: 0
      },
      activePolls: activePollsResult.rows
    });
  } catch (error) {
    logger.error('Error fetching dashboard summary', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

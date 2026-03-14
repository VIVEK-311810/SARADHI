const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate } = require('../middleware/auth');

// Badge definitions
const BADGES = {
  first_responder: { name: 'First Responder', description: 'First correct answer in a poll', icon: '1' },
  perfect_score: { name: 'Perfect Score', description: '100% accuracy in a session', icon: '100' },
  streak_3: { name: 'On Fire', description: '3 correct answers in a row', icon: 'fire' },
  streak_5: { name: 'Unstoppable', description: '5 correct answers in a row', icon: 'fire2' },
  streak_10: { name: 'Legend', description: '10 correct answers in a row', icon: 'lightning' },
  participation_star: { name: 'Participation Star', description: 'Answered all polls in a session', icon: 'star' },
  accuracy_master: { name: 'Accuracy Master', description: '90%+ accuracy over 10+ polls', icon: 'target' }
};

// Helper: award a badge (idempotent — ON CONFLICT DO NOTHING)
async function awardBadge(studentId, badgeType, sessionId = null) {
  const badge = BADGES[badgeType];
  if (!badge) return;

  try {
    await pool.query(`
      INSERT INTO student_badges (student_id, badge_type, badge_name, badge_description, session_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [studentId, badgeType, badge.name, badge.description, sessionId]);
  } catch (error) {
    logger.error('Error awarding badge', { error: error.message, studentId, badgeType });
  }
}

// Helper: award points (idempotent — ON CONFLICT DO NOTHING prevents duplicates)
async function awardPoints(studentId, sessionId, pollId, points, pointType) {
  try {
    await pool.query(`
      INSERT INTO student_points (student_id, session_id, poll_id, points, point_type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (student_id, poll_id, point_type) DO NOTHING
    `, [studentId, sessionId, pollId, points, pointType]);
  } catch (error) {
    logger.error('Error awarding points', { error: error.message, studentId, pointType });
  }
}

// Check session-level badges: participation_star and perfect_score
async function checkSessionBadges(studentId, sessionId) {
  try {
    // Get all polls in this session
    const pollsResult = await pool.query(
      'SELECT id FROM polls WHERE session_id = $1',
      [sessionId]
    );
    const pollIds = pollsResult.rows.map(p => p.id);
    if (pollIds.length === 0) return;

    // Count answers by this student for this session's polls
    const answeredResult = await pool.query(
      'SELECT COUNT(*) as total FROM poll_responses WHERE student_id = $1 AND poll_id = ANY($2)',
      [studentId, pollIds]
    );
    const correctResult = await pool.query(
      'SELECT COUNT(*) as correct FROM poll_responses WHERE student_id = $1 AND poll_id = ANY($2) AND is_correct = true',
      [studentId, pollIds]
    );

    const total = parseInt(answeredResult.rows[0].total);
    const correct = parseInt(correctResult.rows[0].correct);

    // participation_star: answered all polls in session
    if (total >= pollIds.length) {
      await awardBadge(studentId, 'participation_star', sessionId);
    }

    // perfect_score: 100% correct in session (need at least 1 answer)
    if (total > 0 && total === correct) {
      await awardBadge(studentId, 'perfect_score', sessionId);
    }
  } catch (error) {
    logger.error('Error checking session badges', { error: error.message, studentId, sessionId });
  }
}

// Check accuracy_master badge: ≥90% accuracy over ≥10 total poll responses
async function checkAccuracyMaster(studentId) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
      FROM poll_responses WHERE student_id = $1
    `, [studentId]);

    const total = parseInt(result.rows[0].total) || 0;
    const correct = parseInt(result.rows[0].correct) || 0;

    if (total >= 10 && correct / total >= 0.9) {
      await awardBadge(studentId, 'accuracy_master');
    }
  } catch (error) {
    logger.error('Error checking accuracy master badge', { error: error.message, studentId });
  }
}

// Main points calculation — exported for use in polls.js
async function calculatePoints({ studentId, pollId, sessionId, isCorrect, responseTime }) {
  try {
    if (!isCorrect) {
      // Reset streak on wrong answer
      await pool.query(`
        UPDATE student_streaks
        SET current_streak = 0, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = $1
      `, [studentId]);
      return { success: true, points: 0 };
    }

    let totalPoints = 0;

    // +10 for correct answer
    await awardPoints(studentId, sessionId, pollId, 10, 'correct_answer');
    totalPoints += 10;

    // +5 for fast response (< 10 seconds)
    if (responseTime < 10000) {
      await awardPoints(studentId, sessionId, pollId, 5, 'fast_response');
      totalPoints += 5;
    }

    // First responder: use advisory lock to prevent race condition
    const lockClient = await pool.connect();
    try {
      await lockClient.query('BEGIN');
      // Advisory lock scoped to this poll id — prevents two simultaneous first-responder awards
      await lockClient.query('SELECT pg_advisory_xact_lock($1)', [pollId]);

      const firstResponder = await lockClient.query(`
        SELECT student_id FROM poll_responses
        WHERE poll_id = $1 AND is_correct = true
        ORDER BY responded_at ASC LIMIT 1
      `, [pollId]);

      if (firstResponder.rows[0]?.student_id === studentId) {
        await awardPoints(studentId, sessionId, pollId, 10, 'first_responder');
        await awardBadge(studentId, 'first_responder', sessionId);
        totalPoints += 10;
      }
      await lockClient.query('COMMIT');
    } catch (lockErr) {
      await lockClient.query('ROLLBACK');
      logger.error('Error in first responder check', { error: lockErr.message });
    } finally {
      lockClient.release();
    }

    // Update streak (atomic upsert)
    const streakResult = await pool.query(`
      INSERT INTO student_streaks (student_id, current_streak, max_streak, last_correct_at)
      VALUES ($1, 1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (student_id) DO UPDATE SET
        current_streak = student_streaks.current_streak + 1,
        max_streak = GREATEST(student_streaks.max_streak, student_streaks.current_streak + 1),
        last_correct_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING current_streak, max_streak
    `, [studentId]);

    const currentStreak = streakResult.rows[0]?.current_streak || 0;

    if (currentStreak === 3) {
      await awardPoints(studentId, sessionId, pollId, 15, 'streak_bonus_3');
      await awardBadge(studentId, 'streak_3', sessionId);
      totalPoints += 15;
    } else if (currentStreak === 5) {
      await awardPoints(studentId, sessionId, pollId, 30, 'streak_bonus_5');
      await awardBadge(studentId, 'streak_5', sessionId);
      totalPoints += 30;
    } else if (currentStreak === 10) {
      await awardPoints(studentId, sessionId, pollId, 50, 'streak_bonus_10');
      await awardBadge(studentId, 'streak_10', sessionId);
      totalPoints += 50;
    }

    // Check session-level and global badges (non-blocking)
    checkSessionBadges(studentId, sessionId).catch(err =>
      logger.error('Error in checkSessionBadges', { error: err.message })
    );
    checkAccuracyMaster(studentId).catch(err =>
      logger.error('Error in checkAccuracyMaster', { error: err.message })
    );

    return { success: true, points: totalPoints, streak: currentStreak };
  } catch (error) {
    logger.error('Calculate points error', { error: error.message });
    return { success: false, error: error.message };
  }
}

// POST /api/gamification/calculate-points — Teacher-only endpoint for manual point calculation
router.post('/calculate-points', authenticate, async (req, res) => {
  // Only teachers can trigger this externally; internal calls use the exported function directly
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teacher role required.' });
  }
  const { studentId, pollId, sessionId, isCorrect, responseTime } = req.body;
  if (!studentId || !pollId || !sessionId || isCorrect === undefined) {
    return res.status(400).json({ error: 'Missing required fields: studentId, pollId, sessionId, isCorrect' });
  }
  const result = await calculatePoints({ studentId, pollId, sessionId, isCorrect, responseTime: responseTime || 0 });
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json({ error: 'Failed to calculate points' });
  }
});

// GET /api/gamification/leaderboard/session/:sessionId
router.get('/leaderboard/session/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);

    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_id = $1',
      [sessionId.toUpperCase()]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const dbSessionId = sessionResult.rows[0].id;

    const result = await pool.query(`
      SELECT
        u.id as student_id,
        u.full_name as student_name,
        COALESCE(SUM(sp.points), 0) as total_points,
        COUNT(DISTINCT CASE WHEN pr.is_correct THEN pr.id END) as correct_answers,
        COUNT(DISTINCT pr.id) as total_answers,
        COALESCE(ss.current_streak, 0) as current_streak,
        COALESCE(ss.max_streak, 0) as max_streak,
        COALESCE(ROUND(AVG(pr.response_time)::DECIMAL / 1000, 1), 0) as avg_response_time
      FROM session_participants spart
      JOIN users u ON spart.student_id = u.id
      LEFT JOIN student_points sp ON u.id = sp.student_id AND sp.session_id = $1
      LEFT JOIN poll_responses pr ON u.id = pr.student_id
        AND pr.poll_id IN (SELECT id FROM polls WHERE session_id = $1)
      LEFT JOIN student_streaks ss ON u.id = ss.student_id
      WHERE spart.session_id = $1
      GROUP BY u.id, u.full_name, ss.current_streak, ss.max_streak
      ORDER BY total_points DESC, correct_answers DESC
      LIMIT $2
    `, [dbSessionId, limit]);

    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      studentId: row.student_id,
      studentName: row.student_name,
      points: parseInt(row.total_points) || 0,
      correctAnswers: parseInt(row.correct_answers) || 0,
      totalAnswers: parseInt(row.total_answers) || 0,
      currentStreak: parseInt(row.current_streak) || 0,
      maxStreak: parseInt(row.max_streak) || 0,
      avgResponseTime: parseFloat(row.avg_response_time) || 0
    }));

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    logger.error('Session leaderboard error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/gamification/leaderboard/all-time
router.get('/leaderboard/all-time', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);

    const result = await pool.query(`
      SELECT
        u.id as student_id,
        u.full_name as student_name,
        COALESCE(SUM(sp.points), 0) as total_points,
        COUNT(DISTINCT sp.session_id) as sessions_participated,
        COUNT(DISTINCT CASE WHEN pr.is_correct THEN pr.id END) as correct_answers,
        COUNT(DISTINCT pr.id) as total_answers,
        COALESCE(ss.max_streak, 0) as max_streak
      FROM users u
      LEFT JOIN student_points sp ON u.id = sp.student_id
      LEFT JOIN poll_responses pr ON u.id = pr.student_id
      LEFT JOIN student_streaks ss ON u.id = ss.student_id
      WHERE u.role = 'student'
      GROUP BY u.id, u.full_name, ss.max_streak
      HAVING COALESCE(SUM(sp.points), 0) > 0
      ORDER BY total_points DESC
      LIMIT $1
    `, [limit]);

    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      studentId: row.student_id,
      studentName: row.student_name,
      totalPoints: parseInt(row.total_points) || 0,
      sessionsParticipated: parseInt(row.sessions_participated) || 0,
      correctAnswers: parseInt(row.correct_answers) || 0,
      totalAnswers: parseInt(row.total_answers) || 0,
      avgAccuracy: row.total_answers > 0
        ? Math.round((row.correct_answers / row.total_answers) * 100)
        : 0,
      maxStreak: parseInt(row.max_streak) || 0
    }));

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    logger.error('All-time leaderboard error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/gamification/student/:studentId/stats
router.get('/student/:studentId/stats', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Access denied. You can only view your own stats.' });
    }
    // Teachers may only view stats of students enrolled in their sessions
    if (req.user.role === 'teacher') {
      const enrollmentCheck = await pool.query(
        `SELECT 1 FROM session_participants sp
         JOIN sessions s ON sp.session_id = s.id
         WHERE s.teacher_id = $1 AND sp.student_id = $2
         LIMIT 1`,
        [req.user.id, studentId]
      );
      if (enrollmentCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const [pointsResult, rankResult, totalStudentsResult, badgesResult, streakResult, recentResult] =
      await Promise.all([
        pool.query('SELECT COALESCE(SUM(points), 0) as total_points FROM student_points WHERE student_id = $1', [studentId]),
        pool.query(`
          SELECT COUNT(*) + 1 as rank FROM (
            SELECT student_id, SUM(points) as total FROM student_points
            GROUP BY student_id
            HAVING SUM(points) > (SELECT COALESCE(SUM(points), 0) FROM student_points WHERE student_id = $1)
          ) as higher_ranked
        `, [studentId]),
        pool.query('SELECT COUNT(DISTINCT student_id) as total FROM student_points'),
        pool.query('SELECT badge_type, badge_name, badge_description, earned_at FROM student_badges WHERE student_id = $1 ORDER BY earned_at DESC', [studentId]),
        pool.query('SELECT current_streak, max_streak FROM student_streaks WHERE student_id = $1', [studentId]),
        pool.query('SELECT points, point_type, earned_at FROM student_points WHERE student_id = $1 ORDER BY earned_at DESC LIMIT 10', [studentId])
      ]);

    res.json({
      success: true,
      data: {
        totalPoints: parseInt(pointsResult.rows[0]?.total_points) || 0,
        rank: parseInt(rankResult.rows[0]?.rank) || 1,
        totalStudents: parseInt(totalStudentsResult.rows[0]?.total) || 1,
        badges: badgesResult.rows.map(b => ({
          type: b.badge_type,
          name: b.badge_name,
          description: b.badge_description,
          earnedAt: b.earned_at
        })),
        currentStreak: parseInt(streakResult.rows[0]?.current_streak) || 0,
        maxStreak: parseInt(streakResult.rows[0]?.max_streak) || 0,
        recentAchievements: recentResult.rows.map(r => ({
          points: r.points,
          type: r.point_type,
          earnedAt: r.earned_at
        }))
      }
    });
  } catch (error) {
    logger.error('Student stats error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export helpers for use in polls route
module.exports = router;
module.exports.calculatePoints = calculatePoints;
module.exports.awardPoints = awardPoints;
module.exports.awardBadge = awardBadge;

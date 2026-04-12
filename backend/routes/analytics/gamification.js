const express = require('express');
const router = express.Router();
const pool = require('../../db');
const logger = require('../../logger');
const { authenticate } = require('../../middleware/auth');

// ─── XP Level Thresholds ────────────────────────────────────────────────────
const LEVELS = [
  { level: 1, title: 'Newcomer',      minXP: 0    },
  { level: 2, title: 'Active Learner', minXP: 100  },
  { level: 3, title: 'Consistent',    minXP: 300  },
  { level: 4, title: 'Dedicated',     minXP: 600  },
  { level: 5, title: 'Scholar',       minXP: 1000 },
  { level: 6, title: 'Expert',        minXP: 1500 },
  { level: 7, title: 'Master',        minXP: 2500 }
];

function getStudentLevel(totalXP) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (totalXP >= lvl.minXP) current = lvl;
    else break;
  }
  const nextLvl = LEVELS.find(l => l.minXP > totalXP) || null;
  return {
    level: current.level,
    title: current.title,
    currentXP: totalXP,
    nextLevelXP: nextLvl ? nextLvl.minXP : null,
    xpToNextLevel: nextLvl ? nextLvl.minXP - totalXP : 0
  };
}

// ─── Tiered Badge Definitions ────────────────────────────────────────────────
const TIERED_BADGES = {
  attendance: {
    category: 'attendance',
    tiers: {
      bronze: { threshold: 5,  name: 'Regular',   description: 'Attended 5 sessions',  icon: 'calendar' },
      silver: { threshold: 15, name: 'Committed',  description: 'Attended 15 sessions', icon: 'calendar' },
      gold:   { threshold: 30, name: 'Dedicated',  description: 'Attended 30 sessions', icon: 'calendar' }
    }
  },
  accuracy: {
    category: 'accuracy',
    tiers: {
      bronze: { threshold: [10, 0.70], name: 'Sharp',    description: '70%+ accuracy over 10+ polls',  icon: 'target' },
      silver: { threshold: [25, 0.85], name: 'Precise',  description: '85%+ accuracy over 25+ polls',  icon: 'target' },
      gold:   { threshold: [50, 0.95], name: 'Sharpshooter', description: '95%+ accuracy over 50+ polls', icon: 'target' }
    }
  },
  participation: {
    category: 'participation',
    tiers: {
      bronze: { threshold: 50,  name: 'Engaged',     description: 'Answered 50 polls',   icon: 'star' },
      silver: { threshold: 150, name: 'Active',       description: 'Answered 150 polls',  icon: 'star' },
      gold:   { threshold: 500, name: 'Super Active', description: 'Answered 500 polls',  icon: 'star' }
    }
  },
  improvement: {
    category: 'improvement',
    tiers: {
      bronze: { threshold: 3,  name: 'Rising',   description: 'Improved accuracy 3 sessions in a row',  icon: 'trending-up' },
      silver: { threshold: 5,  name: 'Growing',  description: 'Improved accuracy 5 sessions in a row',  icon: 'trending-up' },
      gold:   { threshold: 10, name: 'Soaring',  description: 'Improved accuracy 10 sessions in a row', icon: 'trending-up' }
    }
  },
  consistency: {
    category: 'consistency',
    tiers: {
      bronze: { threshold: 2, name: 'Steady',    description: 'Active for 2 weeks',  icon: 'flame' },
      silver: { threshold: 4, name: 'Reliable',  description: 'Active for 4 weeks',  icon: 'flame' },
      gold:   { threshold: 8, name: 'Committed', description: 'Active for 8 weeks',  icon: 'flame' }
    }
  },
  session_champion: {
    category: 'session_champion',
    tiers: {
      bronze: { threshold: 1,  name: 'Champion',         description: 'Won 1 session',   icon: 'trophy' },
      silver: { threshold: 5,  name: 'Multi-Champion',   description: 'Won 5 sessions',  icon: 'trophy' },
      gold:   { threshold: 15, name: 'Grand Champion',   description: 'Won 15 sessions', icon: 'trophy' }
    }
  }
};

// ─── Helper: Award a badge (idempotent) ─────────────────────────────────────
async function awardBadge(studentId, badgeType, sessionId = null, tier = 'bronze', category = null) {
  // Support old badge types for backward compat
  const legacyBadges = {
    perfect_score:      { name: 'Perfect Score',      description: '100% accuracy in a session', icon: '100',       category: 'accuracy'     },
    participation_star: { name: 'Participation Star',  description: 'Answered all polls in session', icon: 'star',  category: 'participation' }
  };

  let badgeName, badgeDescription;
  if (legacyBadges[badgeType]) {
    badgeName = legacyBadges[badgeType].name;
    badgeDescription = legacyBadges[badgeType].description;
    category = category || legacyBadges[badgeType].category;
  } else {
    // Tiered badge
    const cat = category || badgeType.split('_')[0];
    const catDef = TIERED_BADGES[cat];
    if (catDef?.tiers[tier]) {
      badgeName = catDef.tiers[tier].name;
      badgeDescription = catDef.tiers[tier].description;
      category = cat;
    } else {
      return;
    }
  }

  try {
    await pool.query(`
      INSERT INTO student_badges (student_id, badge_type, badge_name, badge_description, session_id, badge_tier, badge_category)
      SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE NOT EXISTS (
        SELECT 1 FROM student_badges WHERE student_id = $1 AND badge_type = $2
      )
    `, [studentId, badgeType, badgeName, badgeDescription, sessionId, tier, category]);
  } catch (error) {
    logger.error('Error awarding badge', { error: error.message, studentId, badgeType });
  }
}

// ─── Helper: Award points (idempotent, no named constraint required) ─────────
async function awardPoints(studentId, sessionId, pollId, points, pointType) {
  try {
    if (pollId !== null) {
      // Use WHERE NOT EXISTS so no named unique constraint is required
      await pool.query(`
        INSERT INTO student_points (student_id, session_id, poll_id, points, point_type)
        SELECT $1, $2, $3, $4, $5
        WHERE NOT EXISTS (
          SELECT 1 FROM student_points
          WHERE student_id = $1 AND poll_id = $3 AND point_type = $5
        )
      `, [studentId, sessionId, pollId, points, pointType]);
    } else {
      // Session-level award (poll_id IS NULL)
      await pool.query(`
        INSERT INTO student_points (student_id, session_id, poll_id, points, point_type)
        SELECT $1, $2, NULL, $3, $4
        WHERE NOT EXISTS (
          SELECT 1 FROM student_points
          WHERE student_id = $1 AND session_id = $2 AND point_type = $4 AND poll_id IS NULL
        )
      `, [studentId, sessionId, points, pointType]);
    }
  } catch (error) {
    logger.error('Error awarding points', { error: error.message, studentId, pointType });
  }
}

// ─── Helper: Award XP (persistent progression) ──────────────────────────────
async function awardXP(studentId, sessionId, xpType, xpAmount) {
  try {
    await pool.query(`
      INSERT INTO student_xp (student_id, session_id, xp_type, xp_amount)
      SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM student_xp
        WHERE student_id = $1 AND session_id = $2 AND xp_type = $3
      )
    `, [studentId, sessionId, xpType, xpAmount]);
  } catch (error) {
    logger.error('Error awarding XP', { error: error.message, studentId, xpType });
  }
}

// ─── Helper: Get session leaderboard (reusable) ──────────────────────────────
async function getSessionLeaderboard(dbSessionId, limit = 100) {
  const result = await pool.query(`
    SELECT
      u.id as student_id,
      u.full_name as student_name,
      COALESCE(SUM(sp.points), 0) as total_points,
      COUNT(DISTINCT CASE WHEN pr.is_correct THEN pr.id END) as correct_answers,
      COUNT(DISTINCT pr.id) as total_answers,
      COALESCE(sstr.current_streak, 0) as current_streak,
      COALESCE(sstr.max_streak, 0) as max_streak
    FROM session_participants spart
    JOIN users u ON CAST(spart.student_id AS TEXT) = CAST(u.id AS TEXT)
    LEFT JOIN student_points sp ON CAST(u.id AS TEXT) = CAST(sp.student_id AS TEXT) AND sp.session_id = $1
    LEFT JOIN poll_responses pr ON CAST(u.id AS TEXT) = CAST(pr.student_id AS TEXT)
      AND pr.poll_id IN (SELECT id FROM polls WHERE session_id = $1)
    LEFT JOIN session_streaks sstr ON CAST(u.id AS TEXT) = CAST(sstr.student_id AS TEXT) AND sstr.session_id = $1
    WHERE spart.session_id = $1
    GROUP BY u.id, u.full_name, sstr.current_streak, sstr.max_streak
    ORDER BY total_points DESC, correct_answers DESC
    LIMIT $2
  `, [dbSessionId, limit]);

  return result.rows.map((row, index) => ({
    rank: index + 1,
    studentId: row.student_id,
    studentName: row.student_name,
    points: parseInt(row.total_points) || 0,
    correctAnswers: parseInt(row.correct_answers) || 0,
    totalAnswers: parseInt(row.total_answers) || 0,
    currentStreak: parseInt(row.current_streak) || 0,
    maxStreak: parseInt(row.max_streak) || 0
  }));
}

// ─── Check Session-Level Badges ──────────────────────────────────────────────
async function checkSessionBadges(studentId, sessionId) {
  try {
    const pollsResult = await pool.query(
      'SELECT id FROM polls WHERE session_id = $1',
      [sessionId]
    );
    const pollIds = pollsResult.rows.map(p => p.id);
    if (pollIds.length === 0) return;

    const [answeredResult, correctResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM poll_responses WHERE student_id = $1 AND poll_id = ANY($2)', [studentId, pollIds]),
      pool.query('SELECT COUNT(*) as correct FROM poll_responses WHERE student_id = $1 AND poll_id = ANY($2) AND is_correct = true', [studentId, pollIds])
    ]);

    const total = parseInt(answeredResult.rows[0].total);
    const correct = parseInt(correctResult.rows[0].correct);

    if (total >= pollIds.length) {
      await awardBadge(studentId, 'participation_star', sessionId, 'bronze', 'participation');
    }
    if (total > 0 && total === correct) {
      await awardBadge(studentId, 'perfect_score', sessionId, 'bronze', 'accuracy');
    }
  } catch (error) {
    logger.error('Error checking session badges', { error: error.message, studentId, sessionId });
  }
}

// ─── Check All Tiered Badges ─────────────────────────────────────────────────
async function checkTieredBadges(studentId) {
  try {
    // 1. Attendance badge
    const sessionsResult = await pool.query(
      'SELECT COUNT(DISTINCT session_id) as cnt FROM session_participants WHERE student_id = $1',
      [studentId]
    );
    const sessionCount = parseInt(sessionsResult.rows[0].cnt) || 0;
    for (const [tier, def] of Object.entries(TIERED_BADGES.attendance.tiers)) {
      if (sessionCount >= def.threshold) {
        await awardBadge(studentId, `attendance_${tier}`, null, tier, 'attendance');
      }
    }

    // 2. Participation badge
    const pollCountResult = await pool.query(
      'SELECT COUNT(*) as cnt FROM poll_responses WHERE student_id = $1',
      [studentId]
    );
    const pollCount = parseInt(pollCountResult.rows[0].cnt) || 0;
    for (const [tier, def] of Object.entries(TIERED_BADGES.participation.tiers)) {
      if (pollCount >= def.threshold) {
        await awardBadge(studentId, `participation_${tier}`, null, tier, 'participation');
      }
    }

    // 3. Accuracy badge
    const accuracyResult = await pool.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
      FROM poll_responses WHERE student_id = $1
    `, [studentId]);
    const total = parseInt(accuracyResult.rows[0].total) || 0;
    const correct = parseInt(accuracyResult.rows[0].correct) || 0;
    const accuracy = total > 0 ? correct / total : 0;
    for (const [tier, def] of Object.entries(TIERED_BADGES.accuracy.tiers)) {
      const [minPolls, minAccuracy] = def.threshold;
      if (total >= minPolls && accuracy >= minAccuracy) {
        await awardBadge(studentId, `accuracy_${tier}`, null, tier, 'accuracy');
      }
    }

    // 4. Session champion badge
    const champResult = await pool.query(`
      SELECT COUNT(*) as wins FROM session_summaries WHERE student_id = $1 AND rank = 1
    `, [studentId]);
    const wins = parseInt(champResult.rows[0].wins) || 0;
    for (const [tier, def] of Object.entries(TIERED_BADGES.session_champion.tiers)) {
      if (wins >= def.threshold) {
        await awardBadge(studentId, `session_champion_${tier}`, null, tier, 'session_champion');
      }
    }

    // 5. Consistency badge: count distinct weeks with at least one session
    const weeksResult = await pool.query(`
      SELECT COUNT(DISTINCT DATE_TRUNC('week', sp2.joined_at)) as weeks
      FROM session_participants sp2
      WHERE sp2.student_id = $1
    `, [studentId]);
    const weeks = parseInt(weeksResult.rows[0].weeks) || 0;
    for (const [tier, def] of Object.entries(TIERED_BADGES.consistency.tiers)) {
      if (weeks >= def.threshold) {
        await awardBadge(studentId, `consistency_${tier}`, null, tier, 'consistency');
      }
    }
  } catch (error) {
    logger.error('Error checking tiered badges', { error: error.message, studentId });
  }
}

// ─── Main Points Calculation (exported for polls.js) ─────────────────────────
async function calculatePoints({ studentId, pollId, sessionId, isCorrect, difficulty = 1 }) {
  try {
    let totalPoints = 0;

    // +3 for participation (any answer — always)
    await awardPoints(studentId, sessionId, pollId, 3, 'participation');
    totalPoints += 3;

    if (!isCorrect) {
      // Reset session streak on wrong answer
      await pool.query(`
        INSERT INTO session_streaks (student_id, session_id, current_streak, max_streak)
        VALUES ($1, $2, 0, 0)
        ON CONFLICT (student_id, session_id) DO UPDATE SET
          current_streak = 0,
          updated_at = CURRENT_TIMESTAMP
      `, [studentId, sessionId]);
      return { success: true, points: totalPoints, streak: 0 };
    }

    // +10 for correct answer
    await awardPoints(studentId, sessionId, pollId, 10, 'correct_answer');
    totalPoints += 10;

    // Difficulty bonus: +5 (easy) / +10 (medium) / +15 (hard)
    const difficultyPoints = [0, 5, 10, 15][difficulty] || 5;
    await awardPoints(studentId, sessionId, pollId, difficultyPoints, 'difficulty_bonus');
    totalPoints += difficultyPoints;

    // Improvement bonus: +5 if previous poll response this session was wrong
    const prevResult = await pool.query(`
      SELECT pr.is_correct
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      WHERE pr.student_id = $1
        AND p.session_id = $2
        AND pr.poll_id != $3
      ORDER BY pr.responded_at DESC
      LIMIT 1
    `, [studentId, sessionId, pollId]);
    if (prevResult.rows.length > 0 && prevResult.rows[0].is_correct === false) {
      await awardPoints(studentId, sessionId, pollId, 5, 'improvement_bonus');
      totalPoints += 5;
    }

    // Session-scoped streak (atomic upsert)
    const streakResult = await pool.query(`
      INSERT INTO session_streaks (student_id, session_id, current_streak, max_streak)
      VALUES ($1, $2, 1, 1)
      ON CONFLICT (student_id, session_id) DO UPDATE SET
        current_streak = session_streaks.current_streak + 1,
        max_streak = GREATEST(session_streaks.max_streak, session_streaks.current_streak + 1),
        updated_at = CURRENT_TIMESTAMP
      RETURNING current_streak, max_streak
    `, [studentId, sessionId]);
    const currentStreak = streakResult.rows[0]?.current_streak || 0;

    // Streak bonus: +3 per streak level milestone (every 3rd consecutive)
    if (currentStreak > 0 && currentStreak % 3 === 0) {
      const streakBonus = 3 * Math.floor(currentStreak / 3);
      await awardPoints(studentId, sessionId, pollId, streakBonus, `session_streak_bonus`);
      totalPoints += streakBonus;
    }

    // Check session + tiered badges (non-blocking)
    checkSessionBadges(studentId, sessionId).catch(err =>
      logger.error('Error in checkSessionBadges', { error: err.message })
    );
    checkTieredBadges(studentId).catch(err =>
      logger.error('Error in checkTieredBadges', { error: err.message })
    );

    return { success: true, points: totalPoints, streak: currentStreak };
  } catch (error) {
    logger.error('Calculate points error', { error: error.message });
    return { success: false, error: error.message };
  }
}

// ─── Session Completion Points (called on session end) ───────────────────────
async function awardSessionCompletionPoints(sessionId) {
  try {
    // Get all participants and session polls
    const [participantsResult, pollsResult] = await Promise.all([
      pool.query('SELECT student_id FROM session_participants WHERE session_id = $1', [sessionId]),
      pool.query('SELECT id FROM polls WHERE session_id = $1', [sessionId])
    ]);

    const pollIds = pollsResult.rows.map(p => p.id);

    for (const { student_id } of participantsResult.rows) {
      // +5 for session attendance
      await awardPoints(student_id, sessionId, null, 5, 'session_attendance');

      // +10 if answered all polls in session
      if (pollIds.length > 0) {
        const answeredResult = await pool.query(
          'SELECT COUNT(DISTINCT poll_id) as cnt FROM poll_responses WHERE student_id = $1 AND poll_id = ANY($2)',
          [student_id, pollIds]
        );
        if (parseInt(answeredResult.rows[0].cnt) >= pollIds.length) {
          await awardPoints(student_id, sessionId, null, 10, 'all_polls_answered');
        }
      }
    }
  } catch (error) {
    logger.error('Error awarding session completion points', { error: error.message, sessionId });
  }
}

// ─── XP Processing (called on session end) ───────────────────────────────────
async function processSessionEndXP(sessionId) {
  try {
    const participantsResult = await pool.query(
      'SELECT student_id FROM session_participants WHERE session_id = $1',
      [sessionId]
    );

    // +20 XP for everyone who participated
    for (const { student_id } of participantsResult.rows) {
      await awardXP(student_id, sessionId, 'session_participation', 20);
    }

    // Top 3 XP bonuses
    const leaderboard = await getSessionLeaderboard(sessionId, 3);
    const topXP = [30, 20, 10];
    for (let i = 0; i < leaderboard.length; i++) {
      await awardXP(leaderboard[i].studentId, sessionId, 'session_top3', topXP[i]);
    }

    // +25 XP for perfect session (100% correct on all polls)
    const pollsResult = await pool.query('SELECT id FROM polls WHERE session_id = $1', [sessionId]);
    const pollIds = pollsResult.rows.map(p => p.id);
    if (pollIds.length > 0) {
      for (const { student_id } of participantsResult.rows) {
        const perfResult = await pool.query(`
          SELECT COUNT(*) as total,
                 SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
          FROM poll_responses WHERE student_id = $1 AND poll_id = ANY($2)
        `, [student_id, pollIds]);
        const total = parseInt(perfResult.rows[0].total) || 0;
        const correct = parseInt(perfResult.rows[0].correct) || 0;
        if (total > 0 && total === correct && total >= pollIds.length) {
          await awardXP(student_id, sessionId, 'perfect_session', 25);
        }
      }
    }

    // +50 XP for weekly consistency (3+ distinct sessions this week)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const { student_id } of participantsResult.rows) {
      const weekResult = await pool.query(`
        SELECT COUNT(DISTINCT sp2.session_id) as cnt
        FROM session_participants sp2
        JOIN sessions s2 ON sp2.session_id = s2.id
        WHERE sp2.student_id = $1
          AND s2.created_at >= $2
      `, [student_id, oneWeekAgo]);
      if (parseInt(weekResult.rows[0].cnt) >= 3) {
        await awardXP(student_id, sessionId, 'weekly_consistency', 50);
      }
    }
  } catch (error) {
    logger.error('Error processing session end XP', { error: error.message, sessionId });
  }
}

// ─── Generate Session Summaries ───────────────────────────────────────────────
async function generateSessionSummaries(sessionId) {
  try {
    const leaderboard = await getSessionLeaderboard(sessionId, 200);
    const totalParticipants = leaderboard.length;

    for (const entry of leaderboard) {
      const accuracy = entry.totalAnswers > 0
        ? Math.round((entry.correctAnswers / entry.totalAnswers) * 100 * 100) / 100
        : 0;

      // Get XP gained this session
      const xpResult = await pool.query(
        'SELECT COALESCE(SUM(xp_amount), 0) as xp FROM student_xp WHERE student_id = $1 AND session_id = $2',
        [entry.studentId, sessionId]
      );
      const xpGained = parseInt(xpResult.rows[0].xp) || 0;

      // Get new badges earned this session
      const badgesResult = await pool.query(
        'SELECT badge_type FROM student_badges WHERE student_id = $1 AND session_id = $2',
        [entry.studentId, sessionId]
      );
      const badgesEarned = badgesResult.rows.map(b => b.badge_type);

      await pool.query(`
        INSERT INTO session_summaries
          (student_id, session_id, rank, total_participants, accuracy, points_earned, xp_gained, badges_earned)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (student_id, session_id) DO UPDATE SET
          rank = EXCLUDED.rank,
          total_participants = EXCLUDED.total_participants,
          accuracy = EXCLUDED.accuracy,
          points_earned = EXCLUDED.points_earned,
          xp_gained = EXCLUDED.xp_gained,
          badges_earned = EXCLUDED.badges_earned
      `, [entry.studentId, sessionId, entry.rank, totalParticipants, accuracy, entry.points, xpGained, badgesEarned]);
    }

    // Award session champion badges after summaries are stored
    for (const entry of leaderboard) {
      checkTieredBadges(entry.studentId).catch(() => {});
    }
  } catch (error) {
    logger.error('Error generating session summaries', { error: error.message, sessionId });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/gamification/calculate-points  (teacher manual trigger)
router.post('/calculate-points', authenticate, async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teacher role required.' });
  }
  const { studentId, pollId, sessionId, isCorrect, difficulty } = req.body;
  if (!studentId || !pollId || !sessionId || isCorrect === undefined) {
    return res.status(400).json({ error: 'Missing required fields: studentId, pollId, sessionId, isCorrect' });
  }

  // Verify teacher owns this session — prevents awarding points in other teachers' sessions
  const sessionOwnerCheck = await pool.query(
    'SELECT 1 FROM sessions WHERE id = $1 AND teacher_id = $2',
    [sessionId, req.user.id]
  );
  if (sessionOwnerCheck.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied: you do not own this session' });
  }

  const result = await calculatePoints({ studentId, pollId, sessionId, isCorrect, difficulty: difficulty || 1 });
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json({ error: 'Failed to calculate points' });
  }
});

// POST /api/gamification/session/:sessionId/finalize  (teacher only)
router.post('/session/:sessionId/finalize', authenticate, async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teacher role required.' });
  }
  try {
    const { sessionId } = req.params;

    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_id = $1 AND teacher_id = $2',
      [sessionId.toUpperCase(), req.user.id]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or not yours.' });
    }

    const dbSessionId = sessionResult.rows[0].id;
    await awardSessionCompletionPoints(dbSessionId);
    await processSessionEndXP(dbSessionId);
    await generateSessionSummaries(dbSessionId);

    res.json({ success: true, message: 'Session finalized. Points, XP, and summaries generated.' });
  } catch (error) {
    logger.error('Session finalize error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/gamification/session/:sessionId/summary  (student's own summary)
router.get('/session/:sessionId/summary', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const studentId = req.user.role === 'student' ? req.user.id : req.query.studentId;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });

    const result = await pool.query(
      'SELECT * FROM session_summaries WHERE student_id = $1 AND session_id = $2',
      [studentId, sessionId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Summary not yet available.' });
    }
    const s = result.rows[0];
    const xpResult = await pool.query(
      'SELECT COALESCE(SUM(xp_amount), 0) as total FROM student_xp WHERE student_id = $1',
      [studentId]
    );
    const totalXP = parseInt(xpResult.rows[0].total) || 0;

    res.json({
      success: true,
      data: {
        rank: s.rank,
        totalParticipants: s.total_participants,
        accuracy: parseFloat(s.accuracy) || 0,
        pointsEarned: s.points_earned,
        xpGained: s.xp_gained,
        badgesEarned: s.badges_earned || [],
        level: getStudentLevel(totalXP)
      }
    });
  } catch (error) {
    logger.error('Session summary error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/gamification/teacher/session/:sessionId/recap  (teacher only)
router.get('/teacher/session/:sessionId/recap', authenticate, async (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teacher role required.' });
  }
  try {
    const { sessionId } = req.params;

    const sessionCheck = await pool.query(
      'SELECT id FROM sessions WHERE session_id = $1 AND teacher_id = $2',
      [sessionId.toUpperCase(), req.user.id]
    );
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const dbSessionId = sessionCheck.rows[0].id;

    const [leaderboard, pollsResult, participantsResult] = await Promise.all([
      getSessionLeaderboard(dbSessionId, 5),
      pool.query('SELECT id FROM polls WHERE session_id = $1', [dbSessionId]),
      pool.query('SELECT COUNT(*) as cnt FROM session_participants WHERE session_id = $1', [dbSessionId])
    ]);

    const pollIds = pollsResult.rows.map(p => p.id);
    const totalParticipants = parseInt(participantsResult.rows[0].cnt) || 0;

    // Class average accuracy
    let avgAccuracy = 0;
    let engagementRate = 0;
    let needsAttention = [];

    if (pollIds.length > 0 && totalParticipants > 0) {
      const statsResult = await pool.query(`
        SELECT
          u.id as student_id,
          u.full_name,
          COUNT(pr.id) as answered,
          SUM(CASE WHEN pr.is_correct THEN 1 ELSE 0 END) as correct
        FROM session_participants sp
        JOIN users u ON CAST(sp.student_id AS TEXT) = CAST(u.id AS TEXT)
        LEFT JOIN poll_responses pr ON CAST(u.id AS TEXT) = CAST(pr.student_id AS TEXT) AND pr.poll_id = ANY($1)
        WHERE sp.session_id = $2
        GROUP BY u.id, u.full_name
      `, [pollIds, dbSessionId]);

      const allStats = statsResult.rows;
      const totalAnswered = allStats.reduce((sum, s) => sum + parseInt(s.answered || 0), 0);
      const totalCorrect = allStats.reduce((sum, s) => sum + parseInt(s.correct || 0), 0);

      avgAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
      engagementRate = Math.round((totalAnswered / (totalParticipants * pollIds.length)) * 100);

      needsAttention = allStats
        .filter(s => {
          const answered = parseInt(s.answered || 0);
          const correct = parseInt(s.correct || 0);
          const acc = answered > 0 ? correct / answered : 0;
          return answered < pollIds.length * 0.5 || (answered > 0 && acc < 0.4);
        })
        .map(s => ({
          studentId: s.student_id,
          studentName: s.full_name,
          answered: parseInt(s.answered || 0),
          accuracy: parseInt(s.answered) > 0
            ? Math.round((parseInt(s.correct) / parseInt(s.answered)) * 100)
            : 0
        }));
    }

    res.json({
      success: true,
      data: {
        top5: leaderboard,
        classAvgAccuracy: avgAccuracy,
        engagementRate,
        totalParticipants,
        totalPolls: pollIds.length,
        needsAttention
      }
    });
  } catch (error) {
    logger.error('Teacher recap error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
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

    const leaderboard = await getSessionLeaderboard(sessionResult.rows[0].id, limit);
    res.json({ success: true, data: leaderboard });
  } catch (error) {
    logger.error('Session leaderboard error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/gamification/leaderboard/all-time  (XP-ranked)
router.get('/leaderboard/all-time', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);

    const result = await pool.query(`
      SELECT
        u.id as student_id,
        u.full_name as student_name,
        COALESCE(SUM(xp.xp_amount), 0) as total_xp,
        COUNT(DISTINCT xp.session_id) as sessions_participated,
        COUNT(DISTINCT CASE WHEN pr.is_correct THEN pr.id END) as correct_answers,
        COUNT(DISTINCT pr.id) as total_answers,
        COALESCE(MAX(sstr.max_streak), 0) as best_streak
      FROM users u
      LEFT JOIN student_xp xp ON CAST(u.id AS TEXT) = CAST(xp.student_id AS TEXT)
      LEFT JOIN poll_responses pr ON CAST(u.id AS TEXT) = CAST(pr.student_id AS TEXT)
      LEFT JOIN session_streaks sstr ON CAST(u.id AS TEXT) = CAST(sstr.student_id AS TEXT)
      WHERE u.role = 'student'
      GROUP BY u.id, u.full_name
      HAVING COALESCE(SUM(xp.xp_amount), 0) > 0
      ORDER BY total_xp DESC
      LIMIT $1
    `, [limit]);

    const leaderboard = result.rows.map((row, index) => {
      const totalXP = parseInt(row.total_xp) || 0;
      const totalAnswers = parseInt(row.total_answers) || 0;
      const correctAnswers = parseInt(row.correct_answers) || 0;
      return {
        rank: index + 1,
        studentId: row.student_id,
        studentName: row.student_name,
        totalXP,
        level: getStudentLevel(totalXP),
        sessionsParticipated: parseInt(row.sessions_participated) || 0,
        avgAccuracy: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
        bestStreak: parseInt(row.best_streak) || 0
      };
    });

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
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'teacher') {
      const check = await pool.query(
        `SELECT 1 FROM session_participants sp
         JOIN sessions s ON sp.session_id = s.id
         WHERE s.teacher_id = $1 AND sp.student_id = $2 LIMIT 1`,
        [req.user.id, studentId]
      );
      if (check.rows.length === 0) return res.status(403).json({ error: 'Access denied.' });
    }

    const [pointsResult, xpResult, badgesResult, recentResult] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(points), 0) as total_points FROM student_points WHERE student_id = $1', [studentId]),
      pool.query('SELECT COALESCE(SUM(xp_amount), 0) as total_xp FROM student_xp WHERE student_id = $1', [studentId]),
      pool.query(`
        SELECT badge_type, badge_name, badge_description, badge_tier, badge_category, earned_at
        FROM student_badges WHERE student_id = $1 ORDER BY earned_at DESC
      `, [studentId]),
      pool.query('SELECT points, point_type, earned_at FROM student_points WHERE student_id = $1 ORDER BY earned_at DESC LIMIT 10', [studentId])
    ]);

    const totalXP = parseInt(xpResult.rows[0].total_xp) || 0;
    const rankResult = await pool.query(`
      SELECT COUNT(*) + 1 as rank FROM (
        SELECT student_id, SUM(xp_amount) as total FROM student_xp
        GROUP BY student_id
        HAVING SUM(xp_amount) > $1
      ) as higher_ranked
    `, [totalXP]);
    const totalStudentsResult = await pool.query(
      "SELECT COUNT(*) as total FROM users WHERE role = 'student'"
    );

    res.json({
      success: true,
      data: {
        totalPoints: parseInt(pointsResult.rows[0]?.total_points) || 0,
        totalXP,
        level: getStudentLevel(totalXP),
        rank: parseInt(rankResult.rows[0]?.rank) || 1,
        totalStudents: parseInt(totalStudentsResult.rows[0]?.total) || 1,
        badges: badgesResult.rows.map(b => ({
          type: b.badge_type,
          name: b.badge_name,
          description: b.badge_description,
          tier: b.badge_tier,
          category: b.badge_category,
          earnedAt: b.earned_at
        })),
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

// GET /api/gamification/student/:studentId/xp
router.get('/student/:studentId/xp', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [totalResult, historyResult] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(xp_amount), 0) as total FROM student_xp WHERE student_id = $1', [studentId]),
      pool.query(`
        SELECT xp_amount, xp_type, session_id, earned_at
        FROM student_xp WHERE student_id = $1
        ORDER BY earned_at DESC LIMIT 20
      `, [studentId])
    ]);

    const totalXP = parseInt(totalResult.rows[0].total) || 0;
    res.json({
      success: true,
      data: {
        totalXP,
        level: getStudentLevel(totalXP),
        history: historyResult.rows.map(r => ({
          amount: r.xp_amount,
          type: r.xp_type,
          sessionId: r.session_id,
          earnedAt: r.earned_at
        }))
      }
    });
  } catch (error) {
    logger.error('Student XP error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = router;
module.exports.calculatePoints = calculatePoints;
module.exports.awardPoints = awardPoints;
module.exports.awardBadge = awardBadge;
module.exports.awardXP = awardXP;
module.exports.awardSessionCompletionPoints = awardSessionCompletionPoints;
module.exports.processSessionEndXP = processSessionEndXP;
module.exports.generateSessionSummaries = generateSessionSummaries;
module.exports.getSessionLeaderboard = getSessionLeaderboard;
module.exports.getStudentLevel = getStudentLevel;

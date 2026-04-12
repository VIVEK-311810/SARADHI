const express = require('express');
const router = express.Router();
const pool = require('../../db');
const logger = require('../../logger');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const { authenticate, authorize } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');

// Apply rate limit to all export routes — CSV/PDF generation is DB-heavy
router.use(apiLimiter);

// Strip any character that could break a Content-Disposition header or filename
const safeFilePart = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_');

// Helper to convert option index to letter
const optionToLetter = (index) => {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return letters[index] || index.toString();
};

// GET /api/export/poll/:pollId/csv - Export poll results as CSV
router.get('/poll/:pollId/csv', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId } = req.params;

    // Get poll info first
    const pollResult = await pool.query(`
      SELECT p.*, s.title as session_title, s.teacher_id
      FROM polls p
      JOIN sessions s ON p.session_id = s.id
      WHERE p.id = $1
    `, [pollId]);

    if (pollResult.rows.length === 0) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const poll = pollResult.rows[0];

    // Verify teacher owns this poll
    if (poll.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get responses
    const result = await pool.query(`
      SELECT
        u.full_name as student_name,
        u.email,
        pr.selected_option,
        pr.is_correct,
        pr.response_time,
        pr.responded_at
      FROM poll_responses pr
      JOIN users u ON pr.student_id = u.id
      WHERE pr.poll_id = $1
      ORDER BY pr.responded_at ASC
    `, [pollId]);

    const data = result.rows.map(row => ({
      student_name: row.student_name,
      email: row.email,
      selected_answer: optionToLetter(row.selected_option),
      result: row.is_correct ? 'Correct' : 'Incorrect',
      response_time_seconds: (row.response_time / 1000).toFixed(1),
      responded_at: new Date(row.responded_at).toLocaleString()
    }));

    const fields = ['student_name', 'email', 'selected_answer', 'result', 'response_time_seconds', 'responded_at'];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=poll_${safeFilePart(pollId)}_results.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export poll CSV error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/export/session/:sessionId/all-responses/csv - Export all session responses
router.get('/session/:sessionId/all-responses/csv', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session and verify ownership
    const sessionResult = await pool.query(`
      SELECT * FROM sessions WHERE session_id = $1
    `, [sessionId.toUpperCase()]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get all responses
    const result = await pool.query(`
      SELECT
        p.question as poll_question,
        u.full_name as student_name,
        u.email,
        pr.selected_option,
        p.correct_answer,
        pr.is_correct,
        pr.response_time,
        pr.responded_at
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      JOIN users u ON pr.student_id = u.id
      WHERE p.session_id = $1
      ORDER BY p.created_at, pr.responded_at
    `, [session.id]);

    const data = result.rows.map(row => ({
      poll_question: row.poll_question.substring(0, 100),
      student_name: row.student_name,
      email: row.email,
      selected_answer: optionToLetter(row.selected_option),
      correct_answer: optionToLetter(row.correct_answer),
      result: row.is_correct ? 'Correct' : 'Incorrect',
      response_time_seconds: (row.response_time / 1000).toFixed(1),
      responded_at: new Date(row.responded_at).toLocaleString()
    }));

    const fields = ['poll_question', 'student_name', 'email', 'selected_answer', 'correct_answer', 'result', 'response_time_seconds', 'responded_at'];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=session_${safeFilePart(sessionId)}_responses.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export session CSV error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/export/session/:sessionId/report/pdf - Export session report as PDF
router.get('/session/:sessionId/report/pdf', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session
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
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get participants
    const participantsResult = await pool.query(`
      SELECT u.full_name, u.email, sp.joined_at
      FROM session_participants sp
      JOIN users u ON sp.student_id = u.id
      WHERE sp.session_id = $1
      ORDER BY sp.joined_at
    `, [session.id]);

    // Get gamification leaderboard
    const gamificationResult = await pool.query(`
      SELECT
        u.full_name AS student_name,
        COALESCE(SUM(spt.points), 0) AS total_points,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) AS correct_answers,
        COUNT(pr.id) AS total_answers,
        ROUND(100.0 * COUNT(CASE WHEN pr.is_correct THEN 1 END) / NULLIF(COUNT(pr.id), 0), 1) AS accuracy_pct,
        COALESCE(ss.max_streak, 0) AS max_streak,
        COALESCE(STRING_AGG(DISTINCT sb.badge_type, ', '), 'None') AS badges_earned
      FROM session_participants sesp
      JOIN users u ON sesp.student_id = u.id
      LEFT JOIN poll_responses pr ON pr.student_id = u.id
        AND pr.poll_id IN (SELECT id FROM polls WHERE session_id = sesp.session_id)
      LEFT JOIN student_points spt ON spt.student_id::text = u.id::text AND spt.session_id = sesp.session_id
      LEFT JOIN student_streaks ss ON ss.student_id::text = u.id::text
      LEFT JOIN student_badges sb ON sb.student_id::text = u.id::text AND sb.session_id = sesp.session_id
      WHERE sesp.session_id = $1
      GROUP BY u.id, u.full_name, ss.max_streak
      ORDER BY total_points DESC
    `, [session.id]);

    // Get polls with stats
    const pollsResult = await pool.query(`
      SELECT
        p.question,
        p.options,
        p.correct_answer,
        COUNT(pr.id) as response_count,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) as correct_count
      FROM polls p
      LEFT JOIN poll_responses pr ON p.id = pr.poll_id
      WHERE p.session_id = $1
      GROUP BY p.id
      ORDER BY p.created_at
    `, [session.id]);

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=session_${safeFilePart(sessionId)}_report.pdf`);
    doc.pipe(res);

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('Session Report', { align: 'center' });
    doc.moveDown();

    // Session Info
    doc.fontSize(18).font('Helvetica-Bold').text(session.title);
    doc.fontSize(12).font('Helvetica').text(`Course: ${session.course_name || 'N/A'}`);
    doc.text(`Session ID: ${session.session_id}`);
    doc.text(`Teacher: ${session.teacher_name}`);
    doc.text(`Date: ${new Date(session.created_at).toLocaleDateString()}`);
    doc.text(`Status: ${session.is_active ? 'Active' : 'Ended'}`);
    doc.moveDown();

    // Summary Stats
    doc.fontSize(14).font('Helvetica-Bold').text('Summary');
    doc.fontSize(12).font('Helvetica');
    doc.text(`Total Participants: ${participantsResult.rows.length}`);
    doc.text(`Total Polls: ${pollsResult.rows.length}`);

    const totalResponses = pollsResult.rows.reduce((sum, p) => sum + parseInt(p.response_count), 0);
    const totalCorrect = pollsResult.rows.reduce((sum, p) => sum + parseInt(p.correct_count), 0);
    const avgAccuracy = totalResponses > 0 ? ((totalCorrect / totalResponses) * 100).toFixed(1) : 0;

    doc.text(`Total Responses: ${totalResponses}`);
    doc.text(`Average Accuracy: ${avgAccuracy}%`);
    doc.moveDown();

    // Participants Section
    doc.fontSize(14).font('Helvetica-Bold').text('Participants');
    doc.fontSize(10).font('Helvetica');

    if (participantsResult.rows.length > 0) {
      participantsResult.rows.forEach((p, index) => {
        doc.text(`${index + 1}. ${p.full_name} (${p.email})`);
      });
    } else {
      doc.text('No participants');
    }
    doc.moveDown();

    // Poll Results Section
    doc.fontSize(14).font('Helvetica-Bold').text('Poll Results');

    if (pollsResult.rows.length > 0) {
      pollsResult.rows.forEach((poll, index) => {
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica-Bold').text(`Poll ${index + 1}: ${poll.question}`);
        doc.fontSize(10).font('Helvetica');

        const accuracy = poll.response_count > 0
          ? ((poll.correct_count / poll.response_count) * 100).toFixed(1)
          : 0;

        doc.text(`Responses: ${poll.response_count} | Correct: ${poll.correct_count} | Accuracy: ${accuracy}%`);
        doc.text(`Correct Answer: ${optionToLetter(poll.correct_answer)}`);
      });
    } else {
      doc.fontSize(10).font('Helvetica').text('No polls created');
    }

    // Gamification Summary Section
    doc.moveDown();
    doc.addPage();
    doc.fontSize(14).font('Helvetica-Bold').fillColor('black').text('Gamification Summary');
    doc.moveDown(0.5);

    if (gamificationResult.rows.length > 0) {
      // Table header
      const colWidths = [30, 130, 60, 70, 55, 50, 120];
      const colX = [50, 80, 210, 270, 340, 395, 445];
      const headerY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('white');
      doc.rect(50, headerY - 2, 495, 16).fill('#4F46E5');
      doc.fillColor('white');
      doc.text('Rank', colX[0], headerY, { width: colWidths[0] });
      doc.text('Student', colX[1], headerY, { width: colWidths[1] });
      doc.text('Points', colX[2], headerY, { width: colWidths[2] });
      doc.text('Correct', colX[3], headerY, { width: colWidths[3] });
      doc.text('Accuracy', colX[4], headerY, { width: colWidths[4] });
      doc.text('Streak', colX[5], headerY, { width: colWidths[5] });
      doc.text('Badges', colX[6], headerY, { width: colWidths[6] });
      doc.moveDown(0.3);

      gamificationResult.rows.forEach((row, index) => {
        if (doc.y > 700) doc.addPage();
        const rowY = doc.y;
        const bg = index % 2 === 0 ? '#F9FAFB' : '#FFFFFF';
        doc.rect(50, rowY - 2, 495, 16).fill(bg);
        doc.fontSize(9).font('Helvetica').fillColor('black');
        const accuracy = row.accuracy_pct ? `${parseFloat(row.accuracy_pct).toFixed(1)}%` : '0%';
        const scoreStr = `${parseInt(row.correct_answers)}/${parseInt(row.total_answers)}`;
        doc.text(`${index + 1}`, colX[0], rowY, { width: colWidths[0] });
        doc.text(row.student_name || '', colX[1], rowY, { width: colWidths[1] });
        doc.text(`${parseInt(row.total_points)} pts`, colX[2], rowY, { width: colWidths[2] });
        doc.text(scoreStr, colX[3], rowY, { width: colWidths[3] });
        doc.text(accuracy, colX[4], rowY, { width: colWidths[4] });
        doc.text(`${parseInt(row.max_streak)}`, colX[5], rowY, { width: colWidths[5] });
        doc.text(row.badges_earned !== 'None' ? row.badges_earned : '-', colX[6], rowY, { width: colWidths[6] });
        doc.moveDown(0.3);
      });

      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica').fillColor('gray')
        .text('Points: Correct=10 | Fast(<10s)=+5 | First Responder=+10 | Streak3=+15 | Streak5=+30 | Streak10=+50');
    } else {
      doc.fontSize(10).font('Helvetica').fillColor('black').text('No gamification data available (no poll responses yet)');
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('gray')
      .text(`Generated on ${new Date().toLocaleString()} | EduPlatform`, { align: 'center' });

    doc.end();
  } catch (error) {
    logger.error('Export session PDF error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/export/session/:sessionId/gamification/csv - Export gamification summary per student
router.get('/session/:sessionId/gamification/csv', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionResult = await pool.query(`
      SELECT * FROM sessions WHERE session_id = $1
    `, [sessionId.toUpperCase()]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT
        u.full_name AS student_name,
        u.email,
        COALESCE(SUM(sp.points), 0) AS total_points,
        COUNT(CASE WHEN pr.is_correct THEN 1 END) AS correct_answers,
        COUNT(pr.id) AS total_answers,
        ROUND(100.0 * COUNT(CASE WHEN pr.is_correct THEN 1 END) / NULLIF(COUNT(pr.id), 0), 1) AS accuracy_pct,
        ROUND(AVG(pr.response_time) / 1000.0, 2) AS avg_response_time_sec,
        COALESCE(ss.current_streak, 0) AS current_streak,
        COALESCE(ss.max_streak, 0) AS max_streak,
        COALESCE(SUM(CASE WHEN sp.point_type = 'correct_answer' THEN sp.points ELSE 0 END), 0) AS pts_correct_answer,
        COALESCE(SUM(CASE WHEN sp.point_type = 'fast_response' THEN sp.points ELSE 0 END), 0) AS pts_fast_response,
        COALESCE(SUM(CASE WHEN sp.point_type = 'first_responder' THEN sp.points ELSE 0 END), 0) AS pts_first_responder,
        COALESCE(SUM(CASE WHEN sp.point_type LIKE 'streak_bonus%' THEN sp.points ELSE 0 END), 0) AS pts_streak_bonus,
        COALESCE(STRING_AGG(DISTINCT sb.badge_type, ', '), 'None') AS badges_earned
      FROM session_participants sesp
      JOIN users u ON sesp.student_id = u.id
      LEFT JOIN poll_responses pr ON pr.student_id = u.id
        AND pr.poll_id IN (SELECT id FROM polls WHERE session_id = sesp.session_id)
      LEFT JOIN student_points sp ON sp.student_id::text = u.id::text AND sp.session_id = sesp.session_id
      LEFT JOIN student_streaks ss ON ss.student_id::text = u.id::text
      LEFT JOIN student_badges sb ON sb.student_id::text = u.id::text AND sb.session_id = sesp.session_id
      WHERE sesp.session_id = $1
      GROUP BY u.id, u.full_name, u.email, ss.current_streak, ss.max_streak
      ORDER BY total_points DESC
    `, [session.id]);

    const data = result.rows.map((row, index) => ({
      rank: index + 1,
      student_name: row.student_name,
      email: row.email,
      total_points: parseInt(row.total_points),
      correct_answers: parseInt(row.correct_answers),
      total_answers: parseInt(row.total_answers),
      accuracy_pct: row.accuracy_pct ? parseFloat(row.accuracy_pct) : 0,
      avg_response_time_sec: row.avg_response_time_sec ? parseFloat(row.avg_response_time_sec) : 0,
      current_streak: parseInt(row.current_streak),
      max_streak: parseInt(row.max_streak),
      pts_correct_answer: parseInt(row.pts_correct_answer),
      pts_fast_response: parseInt(row.pts_fast_response),
      pts_first_responder: parseInt(row.pts_first_responder),
      pts_streak_bonus: parseInt(row.pts_streak_bonus),
      badges_earned: row.badges_earned,
    }));

    const fields = [
      'rank', 'student_name', 'email', 'total_points',
      'correct_answers', 'total_answers', 'accuracy_pct', 'avg_response_time_sec',
      'current_streak', 'max_streak',
      'pts_correct_answer', 'pts_fast_response', 'pts_first_responder', 'pts_streak_bonus',
      'badges_earned',
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=session_${safeFilePart(sessionId)}_gamification.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export gamification CSV error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/export/session/:sessionId/detailed/csv - Export per-response detailed CSV
router.get('/session/:sessionId/detailed/csv', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionResult = await pool.query(`
      SELECT * FROM sessions WHERE session_id = $1
    `, [sessionId.toUpperCase()]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    if (session.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT
        u.full_name AS student_name,
        u.email,
        p.question AS poll_question,
        pr.selected_option,
        p.correct_answer,
        pr.is_correct,
        pr.response_time,
        pr.responded_at,
        COALESCE(SUM(sp.points), 0) AS points_earned,
        COALESCE(STRING_AGG(sp.point_type, '+' ORDER BY sp.point_type), '') AS point_types,
        CASE WHEN SUM(CASE WHEN sp.point_type = 'first_responder' THEN 1 ELSE 0 END) > 0 THEN 'Yes' ELSE 'No' END AS was_first_responder,
        CASE
          WHEN SUM(CASE WHEN sp.point_type = 'streak_bonus_10' THEN 1 ELSE 0 END) > 0 THEN 10
          WHEN SUM(CASE WHEN sp.point_type = 'streak_bonus_5' THEN 1 ELSE 0 END) > 0 THEN 5
          WHEN SUM(CASE WHEN sp.point_type = 'streak_bonus_3' THEN 1 ELSE 0 END) > 0 THEN 3
          ELSE 0
        END AS streak_at_time
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      JOIN users u ON pr.student_id = u.id
      LEFT JOIN student_points sp ON sp.student_id::text = pr.student_id::text
        AND sp.poll_id = pr.poll_id
        AND sp.session_id = p.session_id
      WHERE p.session_id = $1
      GROUP BY u.id, u.full_name, u.email, p.id, p.question, p.correct_answer,
               pr.id, pr.selected_option, pr.is_correct, pr.response_time, pr.responded_at
      ORDER BY p.created_at, pr.responded_at
    `, [session.id]);

    const data = result.rows.map(row => ({
      student_name: row.student_name,
      email: row.email,
      poll_question: row.poll_question.substring(0, 100),
      selected_answer: optionToLetter(row.selected_option),
      correct_answer: optionToLetter(row.correct_answer),
      result: row.is_correct ? 'Correct' : 'Incorrect',
      response_time_sec: (row.response_time / 1000).toFixed(1),
      responded_at: new Date(row.responded_at).toLocaleString(),
      points_earned: parseInt(row.points_earned),
      point_types: row.point_types || 'none',
      was_first_responder: row.was_first_responder,
      streak_at_time: parseInt(row.streak_at_time),
    }));

    const fields = [
      'student_name', 'email', 'poll_question',
      'selected_answer', 'correct_answer', 'result',
      'response_time_sec', 'responded_at',
      'points_earned', 'point_types', 'was_first_responder', 'streak_at_time',
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=session_${safeFilePart(sessionId)}_detailed.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export detailed CSV error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/export/student/:studentId/performance/csv - Export student performance
router.get('/student/:studentId/performance/csv', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user.id;

    // Get student info
    const studentResult = await pool.query(`
      SELECT full_name, email FROM users WHERE id = $1
    `, [studentId]);

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get all responses from teacher's sessions
    const result = await pool.query(`
      SELECT
        s.session_id,
        s.title as session_title,
        p.question as poll_question,
        pr.selected_option,
        p.correct_answer,
        pr.is_correct,
        pr.response_time,
        pr.responded_at
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      JOIN sessions s ON p.session_id = s.id
      WHERE pr.student_id = $1 AND s.teacher_id = $2
      ORDER BY pr.responded_at DESC
    `, [studentId, teacherId]);

    const student = studentResult.rows[0];
    const data = result.rows.map(row => ({
      session_id: row.session_id,
      session_title: row.session_title,
      poll_question: row.poll_question.substring(0, 100),
      selected_answer: optionToLetter(row.selected_option),
      correct_answer: optionToLetter(row.correct_answer),
      result: row.is_correct ? 'Correct' : 'Incorrect',
      response_time_seconds: (row.response_time / 1000).toFixed(1),
      responded_at: new Date(row.responded_at).toLocaleString()
    }));

    const fields = ['session_id', 'session_title', 'poll_question', 'selected_answer', 'correct_answer', 'result', 'response_time_seconds', 'responded_at'];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=student_${safeFilePart(studentId)}_performance.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export student CSV error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

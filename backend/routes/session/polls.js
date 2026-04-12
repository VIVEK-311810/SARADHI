const express = require('express');
const router = express.Router();
const pool = require('../../db');
const logger = require('../../logger');
const { authenticate, authorize } = require('../../middleware/auth');
const { aiLimiter } = require('../../middleware/rateLimiter');
const { calculatePoints } = require('../analytics/gamification');
const mistralClient = require('../../services/infra/mistralClient');

// Track in-progress reveals to prevent race-condition double broadcasts
const revealInProgress = new Set();

// ── gradeResponse ─────────────────────────────────────────────────────────────
// Returns: true (correct) | false (wrong) | null (manual grading required)
function gradeResponse(questionType, answerData, poll) {
  const meta = poll.options_metadata || {};
  switch (questionType) {
    case 'mcq':
    case 'true_false':
      return poll.correct_answer !== null
        ? answerData.selected_option === poll.correct_answer
        : null;

    case 'fill_blank':
    case 'one_word': {
      const accepted = meta.accepted_answers || [];
      if (!accepted.length || answerData.text == null) return false;
      return accepted.some(
        a => a.toLowerCase().trim() === String(answerData.text).toLowerCase().trim()
      );
    }

    case 'numeric': {
      const tolerance = meta.tolerance ?? 0;
      const correct = meta.correct_value;
      if (correct == null || answerData.value == null) return false;
      return Math.abs(Number(answerData.value) - Number(correct)) <= Number(tolerance);
    }

    case 'multi_correct': {
      // answerData.selected_options = [0, 2, ...] (indices)
      const correct = meta.correct_options || [];
      const selected = answerData.selected_options || [];
      if (!correct.length) return null;
      const scheme = meta.marking_scheme || 'all_or_nothing';
      const correctSet = new Set(correct.map(Number));
      const selectedSet = new Set(selected.map(Number));
      // All-or-nothing: exact match
      if (scheme === 'all_or_nothing') {
        return correctSet.size === selectedSet.size &&
          [...correctSet].every(i => selectedSet.has(i));
      }
      // JEE Advanced: +4 all correct, -2 any wrong selected, 0 partial correct only
      if (scheme === 'jee_advanced') {
        const allCorrect = correctSet.size === selectedSet.size &&
          [...correctSet].every(i => selectedSet.has(i));
        if (allCorrect) return true;
        const anyWrong = [...selectedSet].some(i => !correctSet.has(i));
        return anyWrong ? false : null; // null = partial (handled separately in scoring)
      }
      // Per-correct: each correct option selected scores, no penalty for wrong
      const anySelected = [...selectedSet].some(i => correctSet.has(i));
      return anySelected ? null : false; // null = partial marks
    }

    case 'assertion_reason':
      // correct_answer is 0-3 index into fixed options A/B/C/D
      return poll.correct_answer !== null
        ? answerData.selected_option === poll.correct_answer
        : null;

    case 'match_following': {
      // answerData.pairs = { "0": "1", "1": "3", ... } left-idx → right-idx
      const correctPairs = meta.correct_pairs || {};
      const studentPairs = answerData.pairs || {};
      if (!Object.keys(correctPairs).length) return null;
      const allCorrect = Object.entries(correctPairs).every(
        ([l, r]) => String(studentPairs[l]) === String(r)
      );
      return allCorrect ? true : false;
    }

    case 'ordering': {
      // answerData.order = [2, 0, 3, 1] — indices in student's chosen order
      const correctOrder = meta.correct_order || [];
      const studentOrder = answerData.order || [];
      if (!correctOrder.length) return null;
      return JSON.stringify(correctOrder.map(Number)) === JSON.stringify(studentOrder.map(Number));
    }

    case 'short_answer':
    case 'essay':
    case 'differentiate':
      return null; // teacher manual grading

    case 'diagram_labeling': {
      // answerData.labels = { "0": "Mitochondria", "1": "Nucleus", ... }
      const markers = meta.markers || [];
      if (!markers.length) return null;
      const labels = answerData.labels || {};
      const allCorrect = markers.every(
        m => String(labels[String(m.id)] || '').toLowerCase().trim() ===
             String(m.correct_label || '').toLowerCase().trim()
      );
      return allCorrect ? true : false;
    }

    case 'code': {
      const mode = meta.code_mode || 'mcq';
      if (mode === 'mcq') {
        return poll.correct_answer !== null
          ? answerData.selected_option === poll.correct_answer
          : null;
      }
      // fill_blank mode
      const accepted = meta.accepted_answers || [];
      if (!accepted.length || answerData.text == null) return false;
      return accepted.some(
        a => a.toLowerCase().trim() === String(answerData.text).toLowerCase().trim()
      );
    }

    case 'truth_table': {
      // answerData.cells = { "0-2": "1", "1-2": "0", ... } rowIndex-colIndex → "0"|"1"
      const rows = meta.rows || [];
      const studentCells = answerData.cells || {};
      let allCorrect = true;
      let hasAny = false;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          if (row[c].editable) {
            hasAny = true;
            const key = `${r}-${c}`;
            if (String(studentCells[key]) !== String(row[c].value)) {
              allCorrect = false;
            }
          }
        }
      }
      if (!hasAny) return null;
      return allCorrect ? true : false;
    }

    case 'code_trace': {
      // answerData.trace = { "0": "x", "1": "y", ... } stepIndex → student answer
      const steps = meta.steps || [];
      if (!steps.length) return null;
      const trace = answerData.trace || {};
      const allCorrect = steps.every((step, i) => {
        const student = String(trace[String(i)] || '').toLowerCase().trim();
        const correct = String(step.correct_answer || '').toLowerCase().trim();
        return student === correct;
      });
      return allCorrect ? true : false;
    }

    default:
      return null;
  }
}

const { getNumericSessionId } = require('../helpers/sessionHelpers');

// POST / — Create a new poll (teacher only)
router.post('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const {
      session_id, question, options, correct_answer, justification, time_limit, difficulty,
      // rich question type fields
      question_type, question_image_url, question_latex, options_metadata,
      solution_steps, subject_tag, difficulty_level, marks, blooms_level, topic, sub_topic, cluster_id
    } = req.body;

    const VALID_QUESTION_TYPES = [
      'mcq', 'true_false', 'fill_blank', 'numeric', 'short_answer', 'essay', 'code',
      'multi_correct', 'assertion_reason', 'match_following', 'ordering',
      'diagram_labeling', 'truth_table', 'code_trace', 'differentiate',
    ];
    if (!VALID_QUESTION_TYPES.includes(question_type)) {
      return res.status(400).json({ error: `Invalid question_type. Must be one of: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    const qType = question_type;

    // options required for MCQ/true_false/code; optional for others
    const optionsRequired = ['mcq', 'true_false', 'code'].includes(qType);
    if (!session_id || !question) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (optionsRequired && (!options || !Array.isArray(options) || options.length < 2)) {
      return res.status(400).json({ error: 'Options required for this question type (min 2)' });
    }
    if (question.length > 2000) {
      return res.status(400).json({ error: 'Question too long (max 2000 chars)' });
    }
    if (options && options.length > 6) {
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
      `INSERT INTO polls (
        session_id, question, options, correct_answer, justification, time_limit, is_active, difficulty,
        question_type, question_image_url, question_latex, options_metadata,
        solution_steps, subject_tag, difficulty_level, marks, blooms_level, topic, sub_topic, cluster_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        numericSessionId, question,
        options ? JSON.stringify(options) : null,
        correct_answer, justification, limit, false, pollDifficulty,
        qType, question_image_url || null, question_latex || null,
        options_metadata ? JSON.stringify(options_metadata) : null,
        solution_steps ? JSON.stringify(solution_steps) : null,
        subject_tag || null, difficulty_level || 'medium',
        marks || 1, blooms_level || null, topic || null, sub_topic || null, cluster_id || null
      ]
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
    const { selected_option, answer_data, response_time, tab_switches, time_focused_ms } = req.body;
    // Always use authenticated user's ID — prevents IDOR (student acting as another student)
    const student_id = req.user.id;

    // Support both legacy selected_option and new answer_data
    const resolvedAnswerData = answer_data || (selected_option !== undefined ? { selected_option } : null);
    if (resolvedAnswerData === null) {
      return res.status(400).json({ error: 'Missing answer data' });
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

    const questionType = poll.question_type || 'mcq';
    const isCorrect = gradeResponse(questionType, resolvedAnswerData, poll);

    // For legacy MCQ compatibility, extract selected_option from answer_data
    const legacySelectedOption = resolvedAnswerData.selected_option ?? null;

    // Insert response (include proctoring fields if provided)
    const result = await pool.query(
      `INSERT INTO poll_responses (poll_id, student_id, selected_option, is_correct, response_time, answer_data, tab_switches, time_focused_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [pollId, student_id, legacySelectedOption, isCorrect, response_time || 0, JSON.stringify(resolvedAnswerData),
       Number.isInteger(tab_switches) ? tab_switches : 0,
       Number.isFinite(time_focused_ms) ? Math.round(time_focused_ms) : null]
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
    const pollOptions = Array.isArray(poll.options) ? poll.options : [];
    pollOptions.forEach((_, index) => {
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

// PATCH /:pollId/responses/:responseId/confidence — Student saves self-rated confidence
router.patch('/:pollId/responses/:responseId/confidence', authenticate, authorize('student'), async (req, res) => {
  try {
    const { pollId, responseId } = req.params;
    const { confidence } = req.body;

    if (!['low', 'medium', 'high'].includes(confidence)) {
      return res.status(400).json({ error: 'confidence must be low | medium | high' });
    }

    // Only the owning student may update their own response
    const check = await pool.query(
      `SELECT id FROM poll_responses WHERE id = $1 AND poll_id = $2 AND student_id = $3`,
      [responseId, pollId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query(
      `UPDATE poll_responses SET confidence = $1 WHERE id = $2`,
      [confidence, responseId]
    );

    return res.json({ success: true });
  } catch (err) {
    logger.error('Error saving confidence rating', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:pollId/responses/:responseId/grade — Manual grading for essay / short_answer
router.post('/:pollId/responses/:responseId/grade', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId, responseId } = req.params;
    const { is_correct, teacher_feedback } = req.body;

    if (is_correct === undefined || is_correct === null) {
      return res.status(400).json({ error: 'is_correct (true or false) is required' });
    }

    // Verify teacher owns the session containing this poll — prevents IDOR
    const ownerCheck = await pool.query(
      `SELECT pr.id FROM poll_responses pr
       JOIN polls p ON pr.poll_id = p.id
       JOIN sessions s ON p.session_id = s.id
       WHERE pr.id = $1 AND p.id = $2 AND s.teacher_id = $3`,
      [responseId, pollId, req.user.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Response not found or access denied' });
    }

    const result = await pool.query(
      `UPDATE poll_responses
       SET is_correct = $1, teacher_feedback = $2, graded_at = CURRENT_TIMESTAMP, graded_by = $3
       WHERE id = $4
       RETURNING *`,
      [is_correct, teacher_feedback || null, req.user.id, responseId]
    );

    const graded = result.rows[0];

    // Award gamification points now that grade is known (essay/short_answer had null at submit time)
    // ON CONFLICT DO NOTHING prevents double-awarding if somehow called twice
    if (is_correct === true) {
      const pollRow = await pool.query(
        'SELECT session_id, difficulty FROM polls WHERE id = $1',
        [pollId]
      );
      if (pollRow.rows.length > 0) {
        const { session_id: numericSessionId, difficulty } = pollRow.rows[0];
        calculatePoints({
          studentId: graded.student_id,
          pollId: parseInt(pollId),
          sessionId: numericSessionId,
          isCorrect: true,
          difficulty: difficulty || 1,
        }).catch(err => logger.error('Gamification error (manual grade)', { error: err.message }));
      }
    }

    // Broadcast grade result + leaderboard update to the session
    if (global.broadcastToSession) {
      const sessionRow = await pool.query(
        `SELECT s.session_id, s.id as numeric_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
        [pollId]
      );
      if (sessionRow.rows.length > 0) {
        const { session_id: sessionIdStr, numeric_id: numericId } = sessionRow.rows[0];

        // Notify the student their response was graded
        global.broadcastToSession(sessionIdStr, {
          type: 'response-graded',
          pollId,
          responseId,
          studentId: graded.student_id,
          isCorrect: graded.is_correct,
          teacherFeedback: graded.teacher_feedback || null,
        });

        // Broadcast updated leaderboard so rankings reflect the new points
        if (is_correct === true) {
          try {
            const { getSessionLeaderboard } = require('../routes/gamification');
            const leaderboard = await getSessionLeaderboard(numericId, 50);
            global.broadcastToSession(sessionIdStr, { type: 'leaderboard-update', leaderboard });
          } catch (lbErr) {
            logger.warn('Failed to broadcast leaderboard after manual grade', { error: lbErr.message });
          }
        }
      }
    }

    res.json({ success: true, response: graded });
  } catch (error) {
    logger.error('Error grading response', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:pollId/responses/:responseId/suggest-grade — AI grading suggestion
router.post('/:pollId/responses/:responseId/suggest-grade', authenticate, authorize('teacher'), aiLimiter, async (req, res) => {
  try {
    const { pollId, responseId } = req.params;

    // Verify teacher owns the session
    const ownerCheck = await pool.query(
      `SELECT pr.answer_data, p.question, p.justification, p.question_type, p.options_metadata
       FROM poll_responses pr
       JOIN polls p ON pr.poll_id = p.id
       JOIN sessions s ON p.session_id = s.id
       WHERE pr.id = $1 AND p.id = $2 AND s.teacher_id = $3`,
      [responseId, pollId, req.user.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Response not found or access denied' });
    }

    const row = ownerCheck.rows[0];
    const answerData = typeof row.answer_data === 'string' ? JSON.parse(row.answer_data || '{}') : (row.answer_data || {});
    const studentAnswer = answerData.text || answerData.answer || '';

    if (!studentAnswer.trim()) {
      return res.status(400).json({ error: 'No text answer to evaluate' });
    }

    const meta = typeof row.options_metadata === 'string' ? JSON.parse(row.options_metadata || '{}') : (row.options_metadata || {});
    // rubric can be a string (short_answer) or array of criteria objects (essay)
    const rubricText = typeof meta.rubric === 'string'
      ? meta.rubric
      : Array.isArray(meta.rubric) ? meta.rubric.map(r => r.criterion).join('; ') : '';
    const keyPoints = meta.key_points || '';

    const prompt = `You are an academic grader. Evaluate the student's answer for this question.

Question: ${row.question}
${rubricText ? `Grading rubric: ${rubricText}` : ''}
${keyPoints ? `Key points expected: ${keyPoints}` : ''}
${row.justification ? `Additional guidance: ${row.justification}` : ''}

Student's Answer: ${studentAnswer}

Respond in JSON with exactly these fields:
{
  "suggested_correct": true or false,
  "confidence": "high" or "medium" or "low",
  "feedback": "2-3 sentence feedback for the student explaining the grade"
}`;

    const result = await mistralClient.chatComplete(
      mistralClient.models.small,
      [{ role: 'user', content: prompt }],
      { maxTokens: 200 }
    );

    const raw = result.choices?.[0]?.message?.content || '';
    let suggestion = null;
    try {
      const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      suggestion = JSON.parse(clean);
    } catch {
      // Fallback: extract JSON with regex
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) suggestion = JSON.parse(match[0]);
    }

    if (!suggestion) {
      return res.status(502).json({ error: 'AI response could not be parsed' });
    }

    res.json({ success: true, suggestion });
  } catch (error) {
    logger.error('Error generating AI grading suggestion', { error: error.message });
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
        SELECT pr.student_id, pr.is_correct, pr.responded_at, pr.selected_option, pr.answer_data
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
        (SELECT student_id FROM first_correct) AS first_correct_student_id,
        json_agg(json_build_object('selected_option', selected_option, 'answer_data', answer_data, 'is_correct', is_correct)) AS response_details
      FROM responses
    `, [pollId]);

    // Fetch poll to compute type-specific breakdown
    const pollRow = await pool.query('SELECT question_type, options, correct_answer, options_metadata FROM polls WHERE id = $1', [pollId]);
    const stats = rows[0];
    let typeBreakdown = null;

    if (pollRow.rows.length > 0 && stats.response_details) {
      const poll = pollRow.rows[0];
      const qType = poll.question_type || 'mcq';
      const details = stats.response_details.filter(d => d !== null);

      if (qType === 'mcq' || qType === 'true_false' || qType === 'multi_correct') {
        // Option pick frequency
        const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : (poll.options || []);
        const optionCounts = options.map((_, i) => ({ index: i, count: 0 }));
        details.forEach(d => {
          const ad = typeof d.answer_data === 'string' ? JSON.parse(d.answer_data || '{}') : (d.answer_data || {});
          const sel = ad.selected_option ?? d.selected_option;
          if (sel !== null && sel !== undefined && optionCounts[sel]) {
            optionCounts[sel].count++;
          }
        });
        typeBreakdown = { type: 'option_frequency', data: optionCounts };
      } else if (qType === 'match_following') {
        // Per-pair accuracy
        const meta = typeof poll.options_metadata === 'string' ? JSON.parse(poll.options_metadata || '{}') : (poll.options_metadata || {});
        const leftItems = meta.left_items || [];
        const correctPairs = meta.correct_pairs || {};
        const pairCorrect = {};
        const pairTotal = {};
        leftItems.forEach((_, i) => { pairCorrect[i] = 0; pairTotal[i] = 0; });
        details.forEach(d => {
          const ad = typeof d.answer_data === 'string' ? JSON.parse(d.answer_data || '{}') : (d.answer_data || {});
          const studentPairs = ad.pairs || {};
          leftItems.forEach((_, i) => {
            pairTotal[i]++;
            if (String(studentPairs[String(i)]) === String(correctPairs[String(i)])) pairCorrect[i]++;
          });
        });
        typeBreakdown = {
          type: 'pair_accuracy',
          data: leftItems.map((item, i) => ({
            item,
            correct: pairCorrect[i] || 0,
            total: pairTotal[i] || 0,
            pct: pairTotal[i] ? Math.round((pairCorrect[i] / pairTotal[i]) * 100) : 0,
          })),
        };
      } else if (qType === 'ordering') {
        // Per-position accuracy
        const meta = typeof poll.options_metadata === 'string' ? JSON.parse(poll.options_metadata || '{}') : (poll.options_metadata || {});
        const correctOrder = meta.correct_order || [];
        const posCorrect = correctOrder.map(() => 0);
        const posTotal = correctOrder.map(() => 0);
        details.forEach(d => {
          const ad = typeof d.answer_data === 'string' ? JSON.parse(d.answer_data || '{}') : (d.answer_data || {});
          const studentOrder = ad.order || [];
          correctOrder.forEach((correctItem, pos) => {
            posTotal[pos]++;
            if (studentOrder[pos] === correctItem) posCorrect[pos]++;
          });
        });
        typeBreakdown = {
          type: 'position_accuracy',
          data: correctOrder.map((item, pos) => ({
            position: pos + 1,
            item,
            correct: posCorrect[pos] || 0,
            total: posTotal[pos] || 0,
            pct: posTotal[pos] ? Math.round((posCorrect[pos] / posTotal[pos]) * 100) : 0,
          })),
        };
      }
    }

    // Confidence distribution
    const confRes = await pool.query(
      `SELECT confidence, COUNT(*) AS cnt
       FROM poll_responses
       WHERE poll_id = $1 AND confidence IS NOT NULL
       GROUP BY confidence`,
      [pollId]
    );
    const confidenceDist = { low: 0, medium: 0, high: 0 };
    confRes.rows.forEach(r => { confidenceDist[r.confidence] = parseInt(r.cnt, 10); });
    const confTotal = confidenceDist.low + confidenceDist.medium + confidenceDist.high;

    // Count ungraded responses for manual-grade types
    let ungradedCount = null;
    if (pollRow.rows.length > 0) {
      const qType = pollRow.rows[0].question_type || 'mcq';
      if (['essay', 'short_answer', 'differentiate'].includes(qType)) {
        const ungradedRes = await pool.query(
          `SELECT COUNT(*) FROM poll_responses WHERE poll_id = $1 AND is_correct IS NULL`,
          [pollId]
        );
        ungradedCount = parseInt(ungradedRes.rows[0].count, 10);
      }
    }

    res.json({ success: true, data: { ...stats, response_details: undefined, type_breakdown: typeBreakdown, ungraded_count: ungradedCount, confidence_dist: confTotal > 0 ? confidenceDist : null } });
  } catch (err) {
    logger.error('Error fetching poll stats', { error: err.message });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /:pollId/reveal — Teacher manually reveals answers to students mid-poll
router.post('/:pollId/reveal', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pollId } = req.params;

    // Verify teacher owns this poll's session
    const pollCheck = await pool.query(
      `SELECT p.session_id, p.is_active, s.teacher_id FROM polls p JOIN sessions s ON p.session_id = s.id WHERE p.id = $1`,
      [pollId]
    );
    if (pollCheck.rows.length === 0) return res.status(404).json({ error: 'Poll not found' });
    if (String(pollCheck.rows[0].teacher_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await triggerAnswerReveal(pollCheck.rows[0].session_id, parseInt(pollId, 10));
    res.json({ success: true });
  } catch (err) {
    logger.error('Error triggering manual reveal', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
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

// ── Cluster routes ────────────────────────────────────────────────────────────

// POST /clusters — create a passage/case-study cluster
router.post('/clusters', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { session_id, title, passage, passage_image_url, passage_latex } = req.body;
    if (!session_id || !passage) {
      return res.status(400).json({ error: 'session_id and passage are required' });
    }
    // resolve session_id (string) → numeric id
    const sessionRow = await pool.query(
      'SELECT id FROM sessions WHERE session_id = $1',
      [session_id]
    );
    if (sessionRow.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const numericSessionId = sessionRow.rows[0].id;
    const result = await pool.query(
      `INSERT INTO poll_clusters (session_id, title, passage, passage_image_url, passage_latex)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [numericSessionId, title || null, passage, passage_image_url || null, passage_latex || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating cluster', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /clusters/:clusterId — get cluster with its sub-polls
router.get('/clusters/:clusterId', authenticate, async (req, res) => {
  try {
    const { clusterId } = req.params;
    const clusterResult = await pool.query(
      'SELECT * FROM poll_clusters WHERE id = $1',
      [clusterId]
    );
    if (clusterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    const pollsResult = await pool.query(
      'SELECT * FROM polls WHERE cluster_id = $1 ORDER BY created_at ASC',
      [clusterId]
    );
    res.json({ ...clusterResult.rows[0], sub_polls: pollsResult.rows });
  } catch (error) {
    logger.error('Error fetching cluster', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /session/:sessionId/clusters — list all clusters for a session
router.get('/session/:sessionId/clusters', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionRow = await pool.query(
      'SELECT id FROM sessions WHERE session_id = $1',
      [sessionId]
    );
    if (sessionRow.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const numericId = sessionRow.rows[0].id;
    const result = await pool.query(
      `SELECT pc.*, COUNT(p.id) as sub_poll_count
       FROM poll_clusters pc
       LEFT JOIN polls p ON p.cluster_id = pc.id
       WHERE pc.session_id = $1
       GROUP BY pc.id
       ORDER BY pc.created_at ASC`,
      [numericId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error listing clusters', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

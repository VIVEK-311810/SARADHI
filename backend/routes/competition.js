const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate } = require('../middleware/auth');
const mistralClient = require('../services/mistralClient');
const vectorStore = require('../services/vectorStore');
const embeddingService = require('../services/embeddingService');

// ── Enrollment check helper ───────────────────────────────────────────────────
// Returns true if userId is the teacher of or a participant in the session
async function isEnrolled(sessionId, userId) {
  const result = await pool.query(
    `SELECT 1 FROM sessions s
     WHERE s.session_id = $1
       AND (s.teacher_id = $2
            OR EXISTS (
              SELECT 1 FROM session_participants sp
              WHERE sp.session_id = s.id AND sp.student_id = $2
            ))`,
    [sessionId.toUpperCase(), userId]
  );
  return result.rows.length > 0;
}

// ── Room code generator: 6-char uppercase starting with "C" ──────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'C';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── Letter-to-index mapping (mirrors generated-mcqs.js) ──────────────────────
function letterToIndex(letter) {
  if (letter === 'B') return 1;
  if (letter === 'C') return 2;
  if (letter === 'D') return 3;
  return 0; // default 'A' → 0
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/competition/rooms
// Create a new competition room
// ─────────────────────────────────────────────────────────────────────────────
router.post('/rooms', authenticate, async (req, res) => {
  try {
    const { sessionId, timePerQuestion, teacherQuestionCount, studentQuestionIds, teacherPollIds } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    // Optional array of AI question IDs to include; null = use all
    const sqIds = Array.isArray(studentQuestionIds) && studentQuestionIds.length > 0
      ? studentQuestionIds.map(Number).filter(Boolean)
      : null;
    // Optional array of specific teacher poll IDs; overrides teacherQuestionCount when provided
    const tpIds = Array.isArray(teacherPollIds) && teacherPollIds.length > 0
      ? teacherPollIds.map(Number).filter(Boolean)
      : null;

    // Clamp timePerQuestion 10–60, default 20
    const tpq = Math.min(60, Math.max(10, parseInt(timePerQuestion) || 20));

    // Enrollment check
    const enrolled = await isEnrolled(sessionId, req.user.id);
    if (!enrolled) {
      return res.status(403).json({ success: false, error: 'Access denied: you are not enrolled in this session' });
    }

    // Count teacher polls — use specific IDs if provided, otherwise use count-based limit
    let effectiveTeacherCount;
    let tqc;
    if (tpIds) {
      // Verify these poll IDs belong to this session and have a correct_answer
      const validPolls = await pool.query(
        `SELECT COUNT(*) FROM polls p
         JOIN sessions s ON p.session_id = s.id
         WHERE s.session_id = $1 AND p.correct_answer IS NOT NULL AND p.id = ANY($2)`,
        [sessionId.toUpperCase(), tpIds]
      );
      effectiveTeacherCount = parseInt(validPolls.rows[0].count);
      tqc = effectiveTeacherCount;
    } else {
      const pollsCount = await pool.query(
        `SELECT COUNT(*) FROM polls
         WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
           AND correct_answer IS NOT NULL`,
        [sessionId.toUpperCase()]
      );
      const maxTeacherPolls = parseInt(pollsCount.rows[0].count);
      const rawTqc = parseInt(teacherQuestionCount);
      tqc = (!rawTqc || rawTqc <= 0) ? 0 : Math.min(rawTqc, maxTeacherPolls);
      effectiveTeacherCount = tqc > 0 ? tqc : maxTeacherPolls;
    }

    // Count AI-generated student questions (respect selection if provided)
    const studentQCount = sqIds
      ? await pool.query(
          `SELECT COUNT(*) FROM student_questions WHERE session_id = $1 AND id = ANY($2)`,
          [sessionId.toUpperCase(), sqIds]
        )
      : await pool.query(
          `SELECT COUNT(*) FROM student_questions WHERE session_id = $1`,
          [sessionId.toUpperCase()]
        );

    const total = effectiveTeacherCount + parseInt(studentQCount.rows[0].count);
    if (total === 0) {
      return res.status(400).json({
        success: false,
        error: 'No questions available for this session. Ask your teacher to add polls, or generate AI questions first.'
      });
    }

    // Generate unique room code with collision retry
    let roomCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateRoomCode();
      const existing = await pool.query(
        'SELECT 1 FROM competition_rooms WHERE room_code = $1',
        [candidate]
      );
      if (existing.rows.length === 0) {
        roomCode = candidate;
        break;
      }
    }
    if (!roomCode) {
      return res.status(500).json({ success: false, error: 'Failed to generate unique room code. Try again.' });
    }

    const result = await pool.query(
      `INSERT INTO competition_rooms
         (room_code, session_id, created_by, status, time_per_question, total_questions, teacher_question_count, student_question_ids, teacher_poll_ids)
       VALUES ($1, $2, $3, 'waiting', $4, $5, $6, $7, $8)
       RETURNING *`,
      [roomCode, sessionId.toUpperCase(), req.user.id, tpq, total, tqc, sqIds, tpIds]
    );

    // Auto-join creator as player
    await pool.query(
      `INSERT INTO competition_participants (room_id, student_id, role)
       VALUES ($1, $2, 'player')
       ON CONFLICT (room_id, student_id) DO NOTHING`,
      [result.rows[0].id, req.user.id]
    );

    logger.info('Competition room created', { roomCode, sessionId, createdBy: req.user.id });
    res.status(201).json({
      success: true,
      data: {
        roomCode,
        sessionId: sessionId.toUpperCase(),
        totalQuestions: total,
        timePerQuestion: tpq
      }
    });
  } catch (error) {
    logger.error('Error creating competition room', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/competition/teacher/rooms
// Faculty spectator view — returns active/waiting rooms for the teacher's sessions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/teacher/rooms', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         cr.id, cr.room_code, cr.session_id, cr.status,
         cr.time_per_question, cr.total_questions, cr.created_at,
         s.title AS session_title, s.course_name,
         u.full_name AS creator_name,
         (SELECT COUNT(*) FROM competition_participants cp2
          WHERE cp2.room_id = cr.id AND cp2.role = 'player') AS player_count
       FROM competition_rooms cr
       JOIN sessions s ON cr.session_id = s.session_id
       JOIN users u ON cr.created_by = u.id
       WHERE cr.status IN ('waiting', 'active')
         AND s.teacher_id = $1
       ORDER BY cr.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching teacher competition rooms', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/competition/rooms/active
// Discovery — open to all authenticated students
// ─────────────────────────────────────────────────────────────────────────────
router.get('/rooms/active', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         cr.id, cr.room_code, cr.session_id, cr.status,
         cr.time_per_question, cr.total_questions, cr.created_at,
         s.title AS session_title, s.course_name,
         u.full_name AS creator_name,
         (SELECT COUNT(*) FROM competition_participants cp2
          WHERE cp2.room_id = cr.id AND cp2.role = 'player') AS player_count
       FROM competition_rooms cr
       JOIN sessions s ON cr.session_id = s.session_id
       JOIN users u ON cr.created_by = u.id
       WHERE cr.status IN ('waiting', 'active')
       ORDER BY cr.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching active competition rooms', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/competition/rooms/:roomCode
// Room details including participants
// ─────────────────────────────────────────────────────────────────────────────
router.get('/rooms/:roomCode', authenticate, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const roomResult = await pool.query(
      `SELECT cr.*, s.title AS session_title, s.course_name,
              u.full_name AS creator_name
       FROM competition_rooms cr
       JOIN sessions s ON cr.session_id = s.session_id
       JOIN users u ON cr.created_by = u.id
       WHERE cr.room_code = $1`,
      [roomCode.toUpperCase()]
    );
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const participantsResult = await pool.query(
      `SELECT cp.student_id, cp.role, cp.score, cp.correct_count,
              cp.questions_answered, cp.joined_at, u.full_name
       FROM competition_participants cp
       JOIN users u ON cp.student_id = u.id
       WHERE cp.room_id = $1
       ORDER BY cp.score DESC`,
      [roomResult.rows[0].id]
    );

    res.json({
      success: true,
      data: {
        ...roomResult.rows[0],
        participants: participantsResult.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching competition room', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/competition/rooms/:roomCode/join
// Join a room as player or spectator — idempotent
// ─────────────────────────────────────────────────────────────────────────────
router.post('/rooms/:roomCode/join', authenticate, async (req, res) => {
  try {
    const { roomCode } = req.params;
    let { role } = req.body;

    const roomResult = await pool.query(
      `SELECT cr.*, s.session_id AS sess_id
       FROM competition_rooms cr
       JOIN sessions s ON cr.session_id = s.session_id
       WHERE cr.room_code = $1`,
      [roomCode.toUpperCase()]
    );
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    const room = roomResult.rows[0];

    if (room.status === 'finished') {
      return res.status(400).json({ success: false, error: 'This competition has already ended' });
    }

    // Active rooms force spectator role
    if (room.status === 'active') {
      role = 'spectator';
    }
    const finalRole = role === 'spectator' ? 'spectator' : 'player';

    // Enrollment check
    const enrolled = await isEnrolled(room.session_id, req.user.id);
    if (!enrolled) {
      return res.status(403).json({ success: false, error: 'Access denied: you are not enrolled in this session' });
    }

    // UPSERT — idempotent
    await pool.query(
      `INSERT INTO competition_participants (room_id, student_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, student_id) DO NOTHING`,
      [room.id, req.user.id, finalRole]
    );

    // Return current state
    const participantResult = await pool.query(
      `SELECT * FROM competition_participants WHERE room_id = $1 AND student_id = $2`,
      [room.id, req.user.id]
    );

    res.json({
      success: true,
      data: {
        room: { ...room },
        participant: participantResult.rows[0],
        role: participantResult.rows[0]?.role || finalRole
      }
    });
  } catch (error) {
    logger.error('Error joining competition room', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/competition/rooms/:roomCode/participants
// Live participant list for the waiting / active room
// ─────────────────────────────────────────────────────────────────────────────
router.get('/rooms/:roomCode/participants', authenticate, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const roomResult = await pool.query(
      'SELECT id FROM competition_rooms WHERE room_code = $1',
      [roomCode.toUpperCase()]
    );
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const result = await pool.query(
      `SELECT cp.student_id, cp.role, cp.score, cp.correct_count,
              cp.questions_answered, cp.joined_at,
              u.full_name AS display_name
       FROM competition_participants cp
       JOIN users u ON cp.student_id = u.id
       WHERE cp.room_id = $1
       ORDER BY cp.role ASC, cp.joined_at ASC`,
      [roomResult.rows[0].id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching competition participants', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/competition/rooms/:roomCode/leaderboard
// Final or live leaderboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/rooms/:roomCode/leaderboard', authenticate, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const roomResult = await pool.query(
      'SELECT id FROM competition_rooms WHERE room_code = $1',
      [roomCode.toUpperCase()]
    );
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const result = await pool.query(
      `SELECT
         cp.student_id, u.full_name,
         cp.score, cp.correct_count, cp.questions_answered,
         CASE WHEN cp.questions_answered > 0
              THEN ROUND((cp.correct_count::DECIMAL / cp.questions_answered) * 100, 1)
              ELSE 0
         END AS accuracy,
         RANK() OVER (ORDER BY cp.score DESC) AS rank
       FROM competition_participants cp
       JOIN users u ON cp.student_id = u.id
       WHERE cp.room_id = $1 AND cp.role = 'player'
       ORDER BY cp.score DESC`,
      [roomResult.rows[0].id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching competition leaderboard', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/competition/sessions/:sessionId/questions
// Teacher poll count + AI-generated student questions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sessions/:sessionId/questions', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const enrolled = await isEnrolled(sessionId, req.user.id);
    if (!enrolled) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const pollsResult = await pool.query(
      `SELECT p.id, p.question, p.options, p.correct_answer
       FROM polls p
       JOIN sessions s ON p.session_id = s.id
       WHERE s.session_id = $1 AND p.correct_answer IS NOT NULL
       ORDER BY p.created_at ASC`,
      [sessionId.toUpperCase()]
    );

    const studentQs = await pool.query(
      `SELECT sq.id, sq.question, sq.options, sq.correct_answer, sq.justification,
              sq.source, sq.created_by, sq.created_at, u.full_name AS creator_name
       FROM student_questions sq
       JOIN users u ON sq.created_by = u.id
       WHERE sq.session_id = $1
       ORDER BY sq.created_at DESC`,
      [sessionId.toUpperCase()]
    );

    res.json({
      success: true,
      data: {
        teacherPollCount: pollsResult.rows.length,
        teacherPolls: pollsResult.rows,
        studentQuestions: studentQs.rows
      }
    });
  } catch (error) {
    logger.error('Error fetching competition questions', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/competition/sessions/:sessionId/questions/:questionId
// Delete own AI-generated question
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/sessions/:sessionId/questions/:questionId', authenticate, async (req, res) => {
  try {
    const { sessionId, questionId } = req.params;

    const enrolled = await isEnrolled(sessionId, req.user.id);
    if (!enrolled) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const qResult = await pool.query(
      'SELECT * FROM student_questions WHERE id = $1 AND session_id = $2',
      [questionId, sessionId.toUpperCase()]
    );
    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }
    if (String(qResult.rows[0].created_by) !== String(req.user.id)) {
      return res.status(403).json({ success: false, error: 'You can only delete your own questions' });
    }

    await pool.query('DELETE FROM student_questions WHERE id = $1', [questionId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting student question', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/competition/sessions/:sessionId/generate-questions
// AI MCQ generation using session resources via Mistral + Pinecone (same
// pattern as knowledge-cards.js — no n8n dependency)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sessions/:sessionId/generate-questions', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const count = Math.min(10, Math.max(1, parseInt(req.body.count) || 5));
    const fileIds = Array.isArray(req.body.fileIds) && req.body.fileIds.length > 0
      ? req.body.fileIds
      : null;

    const enrolled = await isEnrolled(sessionId, req.user.id);
    if (!enrolled) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Retrieve relevant chunks from vector store for this session (optionally filtered by file IDs)
    const queryText = 'key concepts, definitions, and important facts from the session material';
    const queryEmbedding = await embeddingService.generateEmbedding(queryText);
    const chunks = await vectorStore.searchSimilar(queryEmbedding, sessionId.toUpperCase(), Math.min(count * 3, 20), fileIds);

    if (!chunks || chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No session material found. Please ensure resources are uploaded and processed before generating questions.'
      });
    }

    const context = chunks
      .map((c, i) => `[${i + 1}] ${c.text || c.content || ''}`)
      .join('\n\n')
      .slice(0, 6000);

    const prompt = `You are an expert educator creating multiple-choice quiz questions for a classroom competition.
Based on the following session material, generate exactly ${count} MCQ questions.

MATERIAL:
${context}

Return ONLY a valid JSON array with no other text. Each object must have these exact keys:
- "question": a clear, specific question (1-2 sentences)
- "option_a": first answer option
- "option_b": second answer option
- "option_c": third answer option
- "option_d": fourth answer option
- "correct_answer": the letter of the correct option — exactly one of "A", "B", "C", or "D"
- "justification": brief explanation of why the correct answer is right (1-2 sentences)

Rules: test understanding not memorisation, only one option must be clearly correct, all distractors must be plausible.

Generate exactly ${count} questions now:`;

    const model = process.env.MISTRAL_MODEL_LARGE || 'mistral-large-latest';
    const result = await mistralClient.chatComplete(model, [
      { role: 'user', content: prompt }
    ], { maxTokens: 4000 });

    const text = result.content || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI did not return a valid JSON array');
    }

    const mcqs = JSON.parse(jsonMatch[0]).slice(0, count);
    if (!Array.isArray(mcqs)) throw new Error('AI response is not an array');

    const inserted = [];
    for (const mcq of mcqs) {
      const { question, option_a, option_b, option_c, option_d, correct_answer, justification } = mcq;
      if (!question || !option_a || !option_b || !option_c || !option_d) continue;

      const options = [option_a, option_b, option_c, option_d];
      const correctIndex = letterToIndex(String(correct_answer).toUpperCase().trim());

      const row = await pool.query(
        `INSERT INTO student_questions
           (session_id, created_by, question, options, correct_answer, justification, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'ai')
         RETURNING *`,
        [sessionId.toUpperCase(), req.user.id, question.trim(), JSON.stringify(options), correctIndex, (justification || '').trim()]
      );
      inserted.push(row.rows[0]);
    }

    logger.info('AI competition questions generated', { sessionId, count: inserted.length, userId: req.user.id });
    res.json({ success: true, data: { generated: inserted, count: inserted.length } });
  } catch (error) {
    logger.error('Competition AI generation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message.includes('No session material')
        ? error.message
        : 'Generation failed. Ensure session resources are uploaded, then try again.'
    });
  }
});

module.exports = router;

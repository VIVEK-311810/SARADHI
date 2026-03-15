const express = require('express');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate, authorize } = require('../middleware/auth');
const vectorStore = require('../services/vectorStore');
const embeddingService = require('../services/embeddingService');
const mistralClient = require('../services/mistralClient');
const { awardXP } = require('./gamification');

// ─── AI Generation ───────────────────────────────────────────────────────────

async function generateQAPairs(sessionId, count = 10, topic = '') {
  // Retrieve relevant chunks from Pinecone for this session
  const queryText = topic || 'key concepts and definitions from the session material';
  const queryEmbedding = await embeddingService.generateEmbedding(queryText);
  const chunks = await vectorStore.searchSimilar(queryEmbedding, sessionId, Math.min(count * 2, 20));

  if (!chunks || chunks.length === 0) {
    throw new Error('No session material found to generate cards from. Please upload resources first.');
  }

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.text || c.content || ''}`)
    .join('\n\n')
    .slice(0, 6000); // cap context length

  const prompt = `You are an expert educator creating interactive knowledge cards for a classroom activity.
Based on the following session material, generate exactly ${count} question-answer pairs.

MATERIAL:
${context}

${topic ? `Focus on: ${topic}` : ''}

Return ONLY a valid JSON array. Each object must have these exact keys:
- "question": a clear, specific question (1-2 sentences)
- "answer": a concise, complete answer (1-3 sentences)
- "difficulty": integer 1 (easy), 2 (medium), or 3 (hard)

Example format:
[
  {"question": "What is X?", "answer": "X is ...", "difficulty": 1},
  {"question": "How does Y work?", "answer": "Y works by ...", "difficulty": 2}
]

Generate exactly ${count} pairs now:`;

  const model = process.env.MISTRAL_MODEL_LARGE || 'mistral-large-latest';
  const result = await mistralClient.chatComplete(model, [
    { role: 'user', content: prompt }
  ], { maxTokens: 3000 });

  // Parse the JSON response
  const text = result.content || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON array');

  const pairs = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(pairs)) throw new Error('AI response is not an array');

  return pairs
    .filter(p => p.question && p.answer)
    .slice(0, count)
    .map(p => ({
      question_text: String(p.question).trim(),
      answer_text: String(p.answer).trim(),
      difficulty: [1, 2, 3].includes(parseInt(p.difficulty)) ? parseInt(p.difficulty) : 1
    }));
}

// ─── Distribution Algorithm ───────────────────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignCardsToStudents(pairs, studentIds) {
  if (studentIds.length < 2) throw new Error('Need at least 2 students to distribute cards');

  const shuffledPairs = shuffleArray([...pairs]);
  const shuffledStudents = shuffleArray([...studentIds]);

  // Assign question holders and answer holders so no student has both Q and A of the same pair
  const assignments = [];
  for (let i = 0; i < shuffledPairs.length; i++) {
    const qHolder = shuffledStudents[i % shuffledStudents.length];
    // Offset answer holder by at least 1 position to guarantee different student
    const aHolderIndex = (i + 1 + Math.floor(i / shuffledStudents.length)) % shuffledStudents.length;
    const aHolder = shuffledStudents[aHolderIndex];
    assignments.push({
      pairId: shuffledPairs[i].id,
      questionHolderId: qHolder,
      answerHolderId: aHolder
    });
  }
  return assignments;
}

// ─── Helper: Resolve session by either numeric id or 6-char code ─────────────

async function resolveSession(sessionIdOrCode) {
  const numeric = parseInt(sessionIdOrCode);
  if (!isNaN(numeric) && String(numeric) === String(sessionIdOrCode)) {
    const r = await pool.query('SELECT id, session_id FROM sessions WHERE id = $1', [numeric]);
    return r.rows[0] || null;
  }
  const r = await pool.query('SELECT id, session_id FROM sessions WHERE session_id = $1', [sessionIdOrCode]);
  return r.rows[0] || null;
}

// ─── Helper: Verify teacher owns session ─────────────────────────────────────

async function verifyTeacherOwnsSession(teacherId, numericSessionId) {
  const result = await pool.query(
    'SELECT id FROM sessions WHERE id = $1 AND teacher_id = $2',
    [numericSessionId, teacherId]
  );
  return result.rows.length > 0;
}

// ─── Helper: Get vote counts for a pair ─────────────────────────────────────

async function getPairVotes(pairId) {
  const result = await pool.query(`
    SELECT
      SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) as thumbs_up,
      SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) as thumbs_down
    FROM knowledge_card_votes WHERE pair_id = $1
  `, [pairId]);
  return {
    thumbsUp: parseInt(result.rows[0].thumbs_up) || 0,
    thumbsDown: parseInt(result.rows[0].thumbs_down) || 0
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/knowledge-cards/generate  (teacher only)
router.post('/generate', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId, count = 10, topic = '' } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const session = await resolveSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const owns = await verifyTeacherOwnsSession(req.user.id, session.id);
    if (!owns) return res.status(403).json({ error: 'Access denied: not your session' });

    const sessionCode = session.session_id;

    const pairCount = Math.min(Math.max(parseInt(count) || 10, 3), 20);
    const pairs = await generateQAPairs(sessionCode, pairCount, topic);

    // Create round in draft state — store the 6-char session code so distribute can join session_participants
    const roundResult = await pool.query(`
      INSERT INTO knowledge_card_rounds (session_id, teacher_id, status, total_pairs, topic)
      VALUES ($1, $2, 'draft', $3, $4) RETURNING *
    `, [sessionCode, req.user.id, pairs.length, topic || null]);
    const round = roundResult.rows[0];

    // Insert pairs
    const insertedPairs = [];
    for (let i = 0; i < pairs.length; i++) {
      const { question_text, answer_text, difficulty } = pairs[i];
      const pairResult = await pool.query(`
        INSERT INTO knowledge_card_pairs (round_id, question_text, answer_text, difficulty, order_index)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [round.id, question_text, answer_text, difficulty, i]);
      insertedPairs.push(pairResult.rows[0]);
    }

    logger.info('Knowledge cards generated', { roundId: round.id, count: insertedPairs.length, sessionId });
    res.status(201).json({ success: true, data: { round, pairs: insertedPairs } });
  } catch (error) {
    logger.error('Knowledge cards generate error', { error: error.message });
    if (error.message.includes('No session material')) {
      return res.status(422).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to generate knowledge cards' });
  }
});

// GET /api/knowledge-cards/session/:sessionId  (teacher only)
router.get('/session/:sessionId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionMeta = await resolveSession(sessionId);
    if (!sessionMeta) return res.status(404).json({ error: 'Session not found' });

    const owns = await verifyTeacherOwnsSession(req.user.id, sessionMeta.id);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    // knowledge_card_rounds stores the 6-char session code
    const sessionCode = sessionMeta.session_id;
    const roundsResult = await pool.query(
      'SELECT * FROM knowledge_card_rounds WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionCode]
    );
    const rounds = [];
    for (const round of roundsResult.rows) {
      const pairsResult = await pool.query(
        'SELECT * FROM knowledge_card_pairs WHERE round_id = $1 ORDER BY order_index ASC',
        [round.id]
      );
      rounds.push({ ...round, pairs: pairsResult.rows });
    }
    res.json({ success: true, data: rounds });
  } catch (error) {
    logger.error('Get knowledge cards error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/knowledge-cards/pairs/:pairId  (teacher only — edit text/difficulty)
router.patch('/pairs/:pairId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pairId } = req.params;
    const { question_text, answer_text, difficulty } = req.body;

    // Verify pair belongs to teacher's round/session
    const check = await pool.query(`
      SELECT kcp.id, kcr.status FROM knowledge_card_pairs kcp
      JOIN knowledge_card_rounds kcr ON kcp.round_id = kcr.id
      WHERE kcp.id = $1 AND kcr.teacher_id = $2
    `, [pairId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Pair not found' });
    if (check.rows[0].status !== 'draft') return res.status(400).json({ error: 'Can only edit pairs in draft rounds' });

    const updates = [];
    const values = [];
    let idx = 1;
    if (question_text !== undefined) { updates.push(`question_text = $${idx++}`); values.push(question_text); }
    if (answer_text !== undefined)   { updates.push(`answer_text = $${idx++}`); values.push(answer_text); }
    if (difficulty !== undefined && [1,2,3].includes(parseInt(difficulty))) {
      updates.push(`difficulty = $${idx++}`); values.push(parseInt(difficulty));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    values.push(pairId);
    const result = await pool.query(
      `UPDATE knowledge_card_pairs SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Update pair error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/knowledge-cards/pairs/:pairId  (teacher only — draft only)
router.delete('/pairs/:pairId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pairId } = req.params;
    const check = await pool.query(`
      SELECT kcp.id, kcr.status, kcr.id as round_id FROM knowledge_card_pairs kcp
      JOIN knowledge_card_rounds kcr ON kcp.round_id = kcr.id
      WHERE kcp.id = $1 AND kcr.teacher_id = $2
    `, [pairId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Pair not found' });
    if (check.rows[0].status !== 'draft') return res.status(400).json({ error: 'Can only delete pairs in draft rounds' });

    await pool.query('DELETE FROM knowledge_card_pairs WHERE id = $1', [pairId]);
    // Update round pair count
    await pool.query(
      'UPDATE knowledge_card_rounds SET total_pairs = total_pairs - 1 WHERE id = $1',
      [check.rows[0].round_id]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete pair error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/knowledge-cards/rounds/:roundId/distribute  (teacher only)
router.post('/rounds/:roundId/distribute', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roundId } = req.params;

    const roundResult = await pool.query(
      'SELECT * FROM knowledge_card_rounds WHERE id = $1 AND teacher_id = $2',
      [roundId, req.user.id]
    );
    if (roundResult.rows.length === 0) return res.status(404).json({ error: 'Round not found' });
    const round = roundResult.rows[0];
    if (round.status !== 'draft') return res.status(400).json({ error: 'Round already distributed or completed' });

    // Get all pairs
    const pairsResult = await pool.query(
      'SELECT * FROM knowledge_card_pairs WHERE round_id = $1 ORDER BY order_index ASC',
      [roundId]
    );
    if (pairsResult.rows.length < 2) return res.status(400).json({ error: 'Need at least 2 pairs to distribute' });

    // Resolve 6-char session code — round.session_id may be numeric or 6-char depending on when it was created
    const sessionMeta = await resolveSession(round.session_id);
    const sessionCode = sessionMeta?.session_id || round.session_id;

    // Get online students from session_participants
    const studentsResult = await pool.query(
      'SELECT student_id FROM session_participants WHERE session_id = $1 AND is_active = true',
      [sessionCode]
    );
    if (studentsResult.rows.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 online students to distribute cards' });
    }

    const studentIds = studentsResult.rows.map(r => r.student_id);
    const assignments = assignCardsToStudents(pairsResult.rows, studentIds);

    // Update pairs with assignments
    for (const { pairId, questionHolderId, answerHolderId } of assignments) {
      await pool.query(
        'UPDATE knowledge_card_pairs SET question_holder_id = $1, answer_holder_id = $2 WHERE id = $3',
        [questionHolderId, answerHolderId, pairId]
      );
    }

    // Update round status
    await pool.query(
      "UPDATE knowledge_card_rounds SET status = 'distributed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [roundId]
    );

    // Build per-student card payloads
    const updatedPairsResult = await pool.query(
      'SELECT * FROM knowledge_card_pairs WHERE round_id = $1 ORDER BY order_index ASC',
      [roundId]
    );
    const allPairs = updatedPairsResult.rows;

    // Build student → card mapping
    const studentCards = {};
    for (const pair of allPairs) {
      if (pair.question_holder_id) {
        if (!studentCards[pair.question_holder_id]) studentCards[pair.question_holder_id] = { questions: [], answers: [] };
        studentCards[pair.question_holder_id].questions.push({
          pairId: pair.id,
          questionText: pair.question_text,
          difficulty: pair.difficulty,
          orderIndex: pair.order_index
        });
      }
      if (pair.answer_holder_id) {
        if (!studentCards[pair.answer_holder_id]) studentCards[pair.answer_holder_id] = { questions: [], answers: [] };
        studentCards[pair.answer_holder_id].answers.push({
          pairId: pair.id,
          answerText: pair.answer_text,
          difficulty: pair.difficulty,
          orderIndex: pair.order_index
        });
      }
    }

    // Broadcast personalized cards to each student via WebSocket
    // sessionCode is already the 6-char code resolved above — no extra query needed
    const sessionIdString = sessionCode;
    const normalizedSid = sessionIdString ? sessionIdString.toUpperCase() : null;
    const wsConnections = global.sessionConnections && normalizedSid
      ? global.sessionConnections.get(normalizedSid)
      : null;

    if (wsConnections && wsConnections.length > 0) {
      wsConnections.forEach(ws => {
        if (ws.readyState !== 1) return;
        const card = studentCards[ws.studentId];
        if (card) {
          ws.send(JSON.stringify({
            type: 'cards-distribute',
            roundId: parseInt(roundId),
            sessionId: sessionIdString,
            card: {
              questions: card.questions,
              answers: card.answers
            }
          }));
        }
      });
    }

    logger.info('Knowledge cards distributed', { roundId, students: studentIds.length, pairs: allPairs.length });
    res.json({
      success: true,
      data: {
        roundId: parseInt(roundId),
        totalPairs: allPairs.length,
        totalStudents: studentIds.length,
        assignments: allPairs.map(p => ({
          pairId: p.id,
          questionHolder: p.question_holder_id,
          answerHolder: p.answer_holder_id,
          questionPreview: p.question_text.substring(0, 60) + '...'
        }))
      }
    });
  } catch (error) {
    logger.error('Distribute cards error', { error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// PATCH /api/knowledge-cards/pairs/:pairId/activate  (teacher — mark question active)
router.patch('/pairs/:pairId/activate', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pairId } = req.params;
    const check = await pool.query(`
      SELECT kcp.*, kcr.session_id FROM knowledge_card_pairs kcp
      JOIN knowledge_card_rounds kcr ON kcp.round_id = kcr.id
      WHERE kcp.id = $1 AND kcr.teacher_id = $2
    `, [pairId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Pair not found' });

    const pair = check.rows[0];
    await pool.query(
      "UPDATE knowledge_card_pairs SET status = 'active' WHERE id = $1",
      [pairId]
    );
    await pool.query(
      "UPDATE knowledge_card_rounds SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [pair.round_id]
    );

    // Broadcast to session — pair.session_id is the 6-char code stored in knowledge_card_rounds
    const sessionIdString = pair.session_id;
    if (global.broadcastToSession && sessionIdString) {
      global.broadcastToSession(sessionIdString.toUpperCase(), {
        type: 'card-activate-question',
        pairId: parseInt(pairId),
        questionHolderId: pair.question_holder_id,
        roundId: pair.round_id
      });
    }

    res.json({ success: true, data: { pairId: parseInt(pairId), questionHolderId: pair.question_holder_id } });
  } catch (error) {
    logger.error('Activate pair error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/knowledge-cards/pairs/:pairId/reveal  (teacher — reveal answer holder)
router.patch('/pairs/:pairId/reveal', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pairId } = req.params;
    const check = await pool.query(`
      SELECT kcp.*, kcr.session_id FROM knowledge_card_pairs kcp
      JOIN knowledge_card_rounds kcr ON kcp.round_id = kcr.id
      WHERE kcp.id = $1 AND kcr.teacher_id = $2
    `, [pairId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Pair not found' });

    const pair = check.rows[0];
    await pool.query(
      "UPDATE knowledge_card_pairs SET status = 'revealed' WHERE id = $1",
      [pairId]
    );

    const sessionIdString = pair.session_id;
    if (global.broadcastToSession && sessionIdString) {
      global.broadcastToSession(sessionIdString.toUpperCase(), {
        type: 'card-reveal-answer',
        pairId: parseInt(pairId),
        answerHolderId: pair.answer_holder_id,
        roundId: pair.round_id
      });
    }

    res.json({ success: true, data: { pairId: parseInt(pairId), answerHolderId: pair.answer_holder_id } });
  } catch (error) {
    logger.error('Reveal pair error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/knowledge-cards/pairs/:pairId/complete  (teacher — complete round, award XP)
router.patch('/pairs/:pairId/complete', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { pairId } = req.params;
    const check = await pool.query(`
      SELECT kcp.*, kcr.session_id FROM knowledge_card_pairs kcp
      JOIN knowledge_card_rounds kcr ON kcp.round_id = kcr.id
      WHERE kcp.id = $1 AND kcr.teacher_id = $2
    `, [pairId, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Pair not found' });

    const pair = check.rows[0];
    await pool.query(
      "UPDATE knowledge_card_pairs SET status = 'completed' WHERE id = $1",
      [pairId]
    );

    // Get vote results
    const votes = await getPairVotes(parseInt(pairId));

    // Award XP to question holder and answer holder
    const xpPromises = [];
    if (pair.question_holder_id) {
      xpPromises.push(awardXP(pair.question_holder_id, pair.session_id, 'knowledge_card', 5).catch(() => {}));
    }
    if (pair.answer_holder_id && pair.answer_holder_id !== pair.question_holder_id) {
      xpPromises.push(awardXP(pair.answer_holder_id, pair.session_id, 'knowledge_card', 5).catch(() => {}));
    }
    await Promise.all(xpPromises);

    const sessionIdString = pair.session_id;
    if (global.broadcastToSession && sessionIdString) {
      global.broadcastToSession(sessionIdString.toUpperCase(), {
        type: 'cards-round-complete',
        pairId: parseInt(pairId),
        votes,
        roundId: pair.round_id
      });
    }

    res.json({ success: true, data: { pairId: parseInt(pairId), votes } });
  } catch (error) {
    logger.error('Complete pair error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/knowledge-cards/vote  (student only)
router.post('/vote', authenticate, authorize('student'), async (req, res) => {
  try {
    const { pairId, vote } = req.body;
    if (!pairId || !['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: "pairId and vote ('up' or 'down') are required" });
    }

    const pairCheck = await pool.query(`
      SELECT kcp.*, kcr.session_id FROM knowledge_card_pairs kcp
      JOIN knowledge_card_rounds kcr ON kcp.round_id = kcr.id
      WHERE kcp.id = $1 AND kcp.status IN ('revealed', 'completed')
    `, [pairId]);
    if (pairCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Pair not found or not yet revealed' });
    }

    const pair = pairCheck.rows[0];

    // Verify student is in this session
    const participantCheck = await pool.query(
      'SELECT 1 FROM session_participants WHERE session_id = $1 AND student_id = $2',
      [pair.session_id, req.user.id]
    );
    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant in this session' });
    }

    await pool.query(`
      INSERT INTO knowledge_card_votes (pair_id, student_id, vote)
      VALUES ($1, $2, $3)
      ON CONFLICT (pair_id, student_id) DO UPDATE SET vote = EXCLUDED.vote
    `, [pairId, req.user.id, vote]);

    const votes = await getPairVotes(parseInt(pairId));

    // Broadcast updated vote count — pair.session_id is the 6-char code from knowledge_card_rounds
    const sessionIdString = pair.session_id;
    if (global.broadcastToSession && sessionIdString) {
      global.broadcastToSession(sessionIdString.toUpperCase(), {
        type: 'card-vote-result',
        pairId: parseInt(pairId),
        votes
      });
    }

    res.json({ success: true, data: votes });
  } catch (error) {
    logger.error('Vote error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/knowledge-cards/rounds/:roundId/end  (teacher — end entire activity)
router.post('/rounds/:roundId/end', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roundId } = req.params;
    const roundResult = await pool.query(
      'SELECT * FROM knowledge_card_rounds WHERE id = $1 AND teacher_id = $2',
      [roundId, req.user.id]
    );
    if (roundResult.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    const round = roundResult.rows[0];
    await pool.query(
      "UPDATE knowledge_card_rounds SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [roundId]
    );
    await pool.query(
      "UPDATE knowledge_card_pairs SET status = 'completed' WHERE round_id = $1 AND status NOT IN ('completed', 'skipped')",
      [roundId]
    );

    // round.session_id is the 6-char code stored in knowledge_card_rounds
    const sessionIdString = round.session_id;
    if (global.broadcastToSession && sessionIdString) {
      global.broadcastToSession(sessionIdString.toUpperCase(), {
        type: 'cards-activity-end',
        roundId: parseInt(roundId)
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('End round error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const logger = require('../logger');
const { authenticate, authorize } = require('../middleware/auth');

// Webhook secret validation middleware for n8n callbacks
// n8n must send: X-Webhook-Secret: <value of N8N_WEBHOOK_SECRET env var>
const validateWebhookSecret = (req, res, next) => {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('N8N_WEBHOOK_SECRET env var not configured — rejecting webhook');
    return res.status(503).json({ error: 'Webhook endpoint not configured' });
  }

  const provided = req.headers['x-webhook-secret'];
  if (!provided) {
    logger.warn('Webhook call missing X-Webhook-Secret header', { ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Timing-safe comparison to prevent timing attacks
  try {
    const secretBuf = Buffer.from(secret, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (secretBuf.length !== providedBuf.length || !crypto.timingSafeEqual(secretBuf, providedBuf)) {
      logger.warn('Webhook call with invalid secret', { ip: req.ip });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch {
    logger.warn('Webhook secret comparison error', { ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Endpoint to receive generated MCQs from n8n workflow
// Protected by shared webhook secret (X-Webhook-Secret header)
router.post("/generated-mcqs", validateWebhookSecret, async (req, res) => {
  try {
    const { session_id, mcqs } = req.body;

    if (!session_id || !mcqs || !Array.isArray(mcqs) || mcqs.length === 0) {
      return res.status(400).json({ error: "Missing session_id or MCQs array" });
    }

    // Cap MCQ batch size to prevent abuse
    if (mcqs.length > 50) {
      return res.status(400).json({ error: "Too many MCQs in one batch (max 50)" });
    }

    // Verify session exists and get its numeric ID
    const sessionResult = await pool.query(
      "SELECT id FROM sessions WHERE session_id = $1",
      [session_id.toUpperCase()]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const numericSessionId = sessionResult.rows[0].id;

    // Store MCQs in a temporary table for teacher review
    const insertedMCQs = [];
    for (const mcq of mcqs) {
      const { question, option_a, option_b, option_c, option_d, correct_answer, justification, difficulty } = mcq;

      if (!question || !option_a || !option_b || !option_c || !option_d) {
        logger.warn('Skipping invalid MCQ', { mcqId: mcq.id });
        continue;
      }

      // Convert options to array format
      const options = [option_a, option_b, option_c, option_d];

      // Convert correct_answer from letter to index
      let correctIndex = 0;
      if (correct_answer === 'B') correctIndex = 1;
      else if (correct_answer === 'C') correctIndex = 2;
      else if (correct_answer === 'D') correctIndex = 3;

      const diffNum = parseInt(difficulty);
      const result = await pool.query(
        "INSERT INTO generated_mcqs (session_id, question, options, correct_answer, justification, difficulty, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *",
        [numericSessionId, question, JSON.stringify(options), correctIndex, justification, [1, 2, 3].includes(diffNum) ? diffNum : 1]
      );
      insertedMCQs.push(result.rows[0]);
    }

    res.status(201).json({
      message: "Generated MCQs received and stored for teacher review",
      count: insertedMCQs.length
    });

    // Broadcast to session participants only — not all connected clients
    if (global.broadcastToSession && insertedMCQs.length > 0) {
      global.broadcastToSession(session_id.toUpperCase(), {
        type: 'mcqs-generated',
        sessionId: session_id,
        count: insertedMCQs.length,
        mcqs: insertedMCQs
      });
      logger.info('Broadcasted new MCQs to session', { sessionId: session_id, count: insertedMCQs.length });
    }
  } catch (error) {
    logger.error('Error receiving generated MCQs', { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to fetch generated MCQs for a session
router.get("/sessions/:sessionId/generated-mcqs", authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify session exists AND belongs to this teacher — prevents IDOR
    const sessionResult = await pool.query(
      "SELECT id FROM sessions WHERE session_id = $1 AND teacher_id = $2",
      [sessionId.toUpperCase(), req.user.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const numericSessionId = sessionResult.rows[0].id;

    // Fetch generated MCQs that haven't been sent to students yet
    const result = await pool.query(
      "SELECT * FROM generated_mcqs WHERE session_id = $1 AND sent_to_students = FALSE ORDER BY created_at DESC",
      [numericSessionId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching generated MCQs', { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to send selected MCQs to students via queue system
router.post("/sessions/:sessionId/send-mcqs", authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { mcqIds } = req.body;

    if (!mcqIds || !Array.isArray(mcqIds) || mcqIds.length === 0) {
      return res.status(400).json({ error: "Missing MCQ IDs array" });
    }

    logger.info('Sending MCQs as polls for session', { sessionId, count: mcqIds.length });

    // Verify session exists AND belongs to this teacher — prevents IDOR
    const sessionResult = await pool.query(
      "SELECT id FROM sessions WHERE session_id = $1 AND teacher_id = $2",
      [sessionId.toUpperCase(), req.user.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const numericSessionId = sessionResult.rows[0].id;

    // Fetch the selected MCQs — scoped to this session to prevent cross-session injection
    const mcqsResult = await pool.query(
      "SELECT * FROM generated_mcqs WHERE id = ANY($1) AND session_id = $2",
      [mcqIds, numericSessionId]
    );

    if (mcqsResult.rows.length === 0) {
      return res.status(404).json({ error: "No valid MCQs found" });
    }

    // Convert MCQs to regular polls
    const createdPolls = [];
    for (const mcq of mcqsResult.rows) {
      const pollResult = await pool.query(
        "INSERT INTO polls (session_id, question, options, correct_answer, justification, time_limit, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [numericSessionId, mcq.question, mcq.options, mcq.correct_answer, mcq.justification, 60, false]
      );
      createdPolls.push(pollResult.rows[0]);
    }

    // Mark MCQs as sent
    await pool.query(
      "UPDATE generated_mcqs SET sent_to_students = TRUE, sent_at = CURRENT_TIMESTAMP WHERE id = ANY($1)",
      [mcqIds]
    );

    res.status(201).json({
      success: true,
      message: "MCQs sent as polls",
      polls: createdPolls,
      count: createdPolls.length
    });

  } catch (error) {
    logger.error('Error sending MCQs to students', { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// Queue endpoint removed — poll queue manager not implemented; use /send-mcqs instead
router.post("/sessions/:sessionId/send-mcqs-to-queue", authenticate, authorize('teacher'), (req, res) => {
  res.status(501).json({ error: "Not implemented. Use /send-mcqs instead." });
});

// PUT endpoint to update an MCQ
router.put("/generated-mcqs/:mcqId", authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { mcqId } = req.params;
    const { question, options, correct_answer, justification, time_limit } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({ error: "Invalid question or options" });
    }

    if (typeof correct_answer !== 'number' || correct_answer < 0 || correct_answer >= 4) {
      return res.status(400).json({ error: "Invalid correct answer index" });
    }

    // Update the MCQ — scoped to sessions owned by this teacher to prevent IDOR
    const result = await pool.query(
      `UPDATE generated_mcqs m
       SET question = $1, options = $2, correct_answer = $3, justification = $4, time_limit = $5, updated_at = CURRENT_TIMESTAMP
       FROM sessions s
       WHERE m.id = $6
         AND m.sent_to_students = FALSE
         AND m.session_id = s.id
         AND s.teacher_id = $7
       RETURNING m.*`,
      [question, JSON.stringify(options), correct_answer, justification || '', time_limit || 60, mcqId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "MCQ not found or already sent to students" });
    }

    res.json({ message: "MCQ updated successfully", mcq: result.rows[0] });
  } catch (error) {
    logger.error('Error updating MCQ', { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE endpoint to delete an MCQ
router.delete("/generated-mcqs/:mcqId", authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { mcqId } = req.params;

    // Delete the MCQ — scoped to sessions owned by this teacher to prevent IDOR
    const result = await pool.query(
      `DELETE FROM generated_mcqs m
       USING sessions s
       WHERE m.id = $1
         AND m.sent_to_students = FALSE
         AND m.session_id = s.id
         AND s.teacher_id = $2
       RETURNING m.*`,
      [mcqId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "MCQ not found or already sent to students" });
    }

    res.json({ message: "MCQ deleted successfully" });
  } catch (error) {
    logger.error('Error deleting MCQ', { error: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const logger = require('../../logger');
const { authenticate } = require('../../middleware/auth');

const { getNumericSessionId } = require('../helpers/sessionHelpers');

// Base SELECT for ticket lists — includes per-viewer has_upvoted flag
const TICKET_LIST_QUERY = `
  SELECT
    ct.id, ct.session_id, ct.subject, ct.title, ct.content, ct.status,
    ct.upvote_count, ct.created_at, ct.updated_at, ct.author_id,
    u.full_name AS author_name, u.role AS author_role,
    (SELECT COUNT(*) FROM community_replies cr WHERE cr.ticket_id = ct.id) AS reply_count,
    (SELECT EXISTS(
      SELECT 1 FROM community_upvotes cu
      WHERE cu.ticket_id = ct.id AND cu.user_id = $1
    )) AS has_upvoted
  FROM community_tickets ct
  JOIN users u ON ct.author_id = u.id
`;

// GET /session/:sessionId — list session-specific tickets sorted by upvotes
router.get('/session/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const numericSessionId = await getNumericSessionId(sessionId);
    if (!numericSessionId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify the user is enrolled in or owns this session
    if (userRole === 'student') {
      const enrolled = await pool.query(
        'SELECT 1 FROM session_participants WHERE session_id = $1 AND student_id = $2',
        [numericSessionId, userId]
      );
      if (enrolled.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied: not enrolled in this session' });
      }
    } else if (userRole === 'teacher') {
      const owns = await pool.query(
        'SELECT 1 FROM sessions WHERE id = $1 AND teacher_id = $2',
        [numericSessionId, userId]
      );
      if (owns.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied: not your session' });
      }
    }

    const result = await pool.query(
      `${TICKET_LIST_QUERY}
       WHERE ct.session_id = $2
       ORDER BY ct.upvote_count DESC, ct.created_at DESC`,
      [userId, numericSessionId]
    );
    res.json({ tickets: result.rows });
  } catch (error) {
    logger.error('Error listing session tickets', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /global?subject=X — list global tickets, optionally filtered by subject
router.get('/global', authenticate, async (req, res) => {
  try {
    const { subject } = req.query;
    const userId = req.user.id;

    let query = `${TICKET_LIST_QUERY} WHERE ct.session_id IS NULL`;
    const params = [userId];

    if (subject && subject.trim()) {
      params.push(subject.trim());
      query += ` AND ct.subject = $${params.length}`;
    }
    query += ' ORDER BY ct.upvote_count DESC, ct.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (error) {
    logger.error('Error listing global tickets', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tickets — create a ticket (session-scoped or global)
router.post('/tickets', authenticate, async (req, res) => {
  try {
    const { session_id, subject, title, content } = req.body;
    const authorId = req.user.id;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (title.length > 255) {
      return res.status(400).json({ error: 'Title too long (max 255 characters)' });
    }
    if (content.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10000 characters)' });
    }
    if (session_id && subject) {
      return res.status(400).json({ error: 'Ticket must be either session-specific or global, not both' });
    }
    if (!session_id && !subject) {
      return res.status(400).json({ error: 'Either session_id or subject is required' });
    }

    let numericSessionId = null;
    if (session_id) {
      numericSessionId = await getNumericSessionId(session_id);
      if (!numericSessionId) {
        return res.status(404).json({ error: 'Session not found' });
      }
    }

    const result = await pool.query(
      `INSERT INTO community_tickets (session_id, subject, title, content, author_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [numericSessionId, subject ? subject.trim() : null, title.trim(), content.trim(), authorId]
    );

    // Fetch with author info for full response
    const withAuthor = await pool.query(
      `SELECT ct.*, u.full_name AS author_name, u.role AS author_role
       FROM community_tickets ct JOIN users u ON ct.author_id = u.id
       WHERE ct.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(withAuthor.rows[0]);
  } catch (error) {
    logger.error('Error creating ticket', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /tickets/:ticketId — get ticket detail with replies
router.get('/tickets/:ticketId', authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    const ticketResult = await pool.query(
      `SELECT ct.*, u.full_name AS author_name, u.role AS author_role,
              (SELECT EXISTS(
                SELECT 1 FROM community_upvotes cu
                WHERE cu.ticket_id = ct.id AND cu.user_id = $2
              )) AS has_upvoted
       FROM community_tickets ct
       JOIN users u ON ct.author_id = u.id
       WHERE ct.id = $1`,
      [ticketId, userId]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const repliesResult = await pool.query(
      `SELECT cr.*, u.full_name AS author_name, u.role AS author_role
       FROM community_replies cr
       JOIN users u ON cr.author_id = u.id
       WHERE cr.ticket_id = $1
       ORDER BY cr.is_solution DESC, cr.created_at ASC`,
      [ticketId]
    );

    res.json({ ticket: ticketResult.rows[0], replies: repliesResult.rows });
  } catch (error) {
    logger.error('Error fetching ticket', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tickets/:ticketId/replies — add a reply
router.post('/tickets/:ticketId/replies', authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { content } = req.body;
    const authorId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const ticketCheck = await pool.query(
      'SELECT id FROM community_tickets WHERE id = $1',
      [ticketId]
    );
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const result = await pool.query(
      `INSERT INTO community_replies (ticket_id, author_id, content)
       VALUES ($1, $2, $3) RETURNING id`,
      [ticketId, authorId, content.trim()]
    );

    const withAuthor = await pool.query(
      `SELECT cr.*, u.full_name AS author_name, u.role AS author_role
       FROM community_replies cr JOIN users u ON cr.author_id = u.id
       WHERE cr.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(withAuthor.rows[0]);
  } catch (error) {
    logger.error('Error adding reply', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tickets/:ticketId/upvote — toggle upvote (transaction-safe)
router.post('/tickets/:ticketId/upvote', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT 1 FROM community_upvotes WHERE ticket_id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    let action;
    if (existing.rows.length > 0) {
      await client.query('DELETE FROM community_upvotes WHERE ticket_id = $1 AND user_id = $2', [ticketId, userId]);
      await client.query('UPDATE community_tickets SET upvote_count = GREATEST(0, upvote_count - 1) WHERE id = $1', [ticketId]);
      action = 'removed';
    } else {
      await client.query('INSERT INTO community_upvotes (ticket_id, user_id) VALUES ($1, $2)', [ticketId, userId]);
      await client.query('UPDATE community_tickets SET upvote_count = upvote_count + 1 WHERE id = $1', [ticketId]);
      action = 'added';
    }

    const updated = await client.query('SELECT upvote_count FROM community_tickets WHERE id = $1', [ticketId]);
    await client.query('COMMIT');

    res.json({ action, upvote_count: parseInt(updated.rows[0].upvote_count) });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error toggling upvote', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PATCH /tickets/:ticketId/resolve — mark ticket as resolved (author or session teacher)
router.patch('/tickets/:ticketId/resolve', authenticate, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const ticket = await pool.query(
      `SELECT ct.id, ct.author_id, ct.session_id, s.teacher_id AS session_teacher_id
       FROM community_tickets ct
       LEFT JOIN sessions s ON ct.session_id = s.id
       WHERE ct.id = $1`,
      [ticketId]
    );
    if (ticket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const t = ticket.rows[0];
    const isAuthor = t.author_id === userId;
    // Teachers can only resolve tickets in sessions they own (or global tickets if no session)
    const isSessionTeacher = userRole === 'teacher' && (
      t.session_id === null || String(t.session_teacher_id) === String(userId)
    );
    if (!isAuthor && !isSessionTeacher) {
      return res.status(403).json({ error: 'Only the ticket author or the session teacher can resolve this ticket' });
    }

    const result = await pool.query(
      `UPDATE community_tickets
       SET status = 'resolved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [ticketId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error resolving ticket', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /replies/:replyId/solution — mark reply as solution (ticket author or teacher)
router.patch('/replies/:replyId/solution', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { replyId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    await client.query('BEGIN');

    const replyResult = await client.query(
      `SELECT cr.*, ct.author_id AS ticket_author_id, ct.id AS ticket_id,
              ct.session_id AS ticket_session_id, s.teacher_id AS session_teacher_id
       FROM community_replies cr
       JOIN community_tickets ct ON cr.ticket_id = ct.id
       LEFT JOIN sessions s ON ct.session_id = s.id
       WHERE cr.id = $1`,
      [replyId]
    );
    if (replyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reply not found' });
    }

    const reply = replyResult.rows[0];
    const isTicketAuthor = reply.ticket_author_id === userId;
    // Teachers can only mark solutions in sessions they own (or global tickets)
    const isSessionTeacher = userRole === 'teacher' && (
      reply.ticket_session_id === null || String(reply.session_teacher_id) === String(userId)
    );
    if (!isTicketAuthor && !isSessionTeacher) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the ticket author or the session teacher can mark a solution' });
    }

    // Un-mark any existing solution for this ticket
    await client.query(
      'UPDATE community_replies SET is_solution = FALSE WHERE ticket_id = $1',
      [reply.ticket_id]
    );

    // Mark this reply as solution
    await client.query('UPDATE community_replies SET is_solution = TRUE WHERE id = $1', [replyId]);

    // Auto-resolve the ticket
    await client.query(
      `UPDATE community_tickets
       SET status = 'resolved', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [reply.ticket_id]
    );

    await client.query('COMMIT');
    res.json({ success: true, replyId: parseInt(replyId), ticketId: reply.ticket_id });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error marking solution', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;

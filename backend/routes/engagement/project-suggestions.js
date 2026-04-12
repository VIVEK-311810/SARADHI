const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../../db');
const logger = require('../../logger');
const { authenticate, authorize } = require('../../middleware/auth');
const { aiLimiter } = require('../../middleware/rateLimiter');
const { supabase } = require('../../config/supabase');
const multer = require('multer');
const { projectSuggestionsQueue } = require('../../queues');
const { generateProjectSuggestions } = require('../../services/content/projectSuggestionService');

// In-memory multer — file goes straight to Supabase, no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — matches existing resource limit
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF, DOC, and DOCX files are accepted'));
  },
});

const { getNumericSessionId, studentIsEnrolled, teacherOwnsSession } = require('../helpers/sessionHelpers');

// ── Helper: broadcast notification via WS ────────────────────────────────────
async function broadcastNotification(stringSessionId, payload) {
  if (global.broadcastToSession) {
    await global.broadcastToSession(stringSessionId.toUpperCase(), payload).catch(() => {});
  }
}

// ── Helper: award XP on submission ───────────────────────────────────────────
async function awardSubmissionXP(studentId, numericSessionId) {
  try {
    await pool.query(`
      INSERT INTO student_xp (student_id, session_id, xp_type, xp_amount)
      SELECT $1, $2, 'assignment_submission', 50
      WHERE NOT EXISTS (
        SELECT 1 FROM student_xp
        WHERE student_id = $1 AND session_id = $2 AND xp_type = 'assignment_submission'
      )
    `, [studentId, numericSessionId]);
  } catch (err) {
    logger.warn('Could not award submission XP (non-fatal)', { error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /:sessionId/projects/generate
// Teacher triggers AI project suggestion generation.
// Enqueues a BullMQ job (or runs synchronously if Redis is unavailable).
// ────────────────────────────────────────────────────────────────────────────
router.post('/:sessionId/projects/generate', authenticate, authorize('teacher'), aiLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { hint } = req.body; // optional faculty steering hint

    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });

    if (!(await teacherOwnsSession(numericId, req.user.id))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    // Idempotency: if already generating, return current status
    const existing = await pool.query(
      'SELECT generation_status FROM session_projects WHERE session_id = $1',
      [numericId]
    );
    if (existing.rows.length > 0 && existing.rows[0].generation_status === 'generating') {
      return res.json({ status: 'generating', message: 'Generation already in progress' });
    }

    // Set status to generating
    await pool.query(`
      INSERT INTO session_projects (session_id, generated_by, generation_status, suggestions, updated_at)
      VALUES ($1, $2, 'generating', '[]'::jsonb, NOW())
      ON CONFLICT (session_id) DO UPDATE
        SET generation_status = 'generating', generated_by = $2, updated_at = NOW(), generation_error = NULL
    `, [numericId, req.user.id]);

    // Enqueue or run synchronously
    if (projectSuggestionsQueue) {
      await projectSuggestionsQueue.add('generate', {
        numericSessionId: numericId,
        stringSessionId: sessionId,
        hint: hint || null,
      }, { attempts: 2, backoff: { type: 'exponential', delay: 5000 } });
      res.json({ status: 'generating', message: 'Project suggestions are being generated' });
    } else {
      // No Redis — run in-process (blocks for ~5-15s but ensures it works)
      logger.warn('projectSuggestions: Redis unavailable, running synchronously');
      const suggestions = await generateProjectSuggestions(numericId, hint || null);
      await broadcastNotification(sessionId, {
        type: 'project-suggestions-ready',
        sessionId,
        count: suggestions.length,
      });
      res.json({ status: 'completed', suggestions, count: suggestions.length });
    }
  } catch (error) {
    logger.error('Error triggering project suggestions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:sessionId/projects
// Fetch project suggestions.
// Teachers: always see the record (including unpublished).
// Students: only see when is_published = true.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId/projects', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });

    const { role, id: userId } = req.user;

    // IDOR: verify access
    if (role === 'student') {
      if (!(await studentIsEnrolled(numericId, userId))) {
        return res.status(403).json({ error: 'Access denied: not enrolled in this session' });
      }
    } else if (role === 'teacher') {
      if (!(await teacherOwnsSession(numericId, userId))) {
        return res.status(403).json({ error: 'Access denied: not your session' });
      }
    }

    const result = await pool.query(
      `SELECT id, generation_status, suggestions, is_published, generation_error, generated_at, updated_at
       FROM session_projects WHERE session_id = $1`,
      [numericId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'none', suggestions: [], isPublished: false });
    }

    const row = result.rows[0];

    // Students cannot see unpublished suggestions
    if (role === 'student' && !row.is_published) {
      return res.json({ status: 'none', suggestions: [], isPublished: false });
    }

    res.json({
      id: row.id,
      status: row.generation_status,
      suggestions: row.suggestions || [],
      isPublished: row.is_published,
      generationError: row.generation_error,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    logger.error('Error fetching project suggestions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /:sessionId/projects/:projectId
// Teacher edits the JSONB suggestions array in place.
// ────────────────────────────────────────────────────────────────────────────
router.patch('/:sessionId/projects/:projectId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId, projectId } = req.params;
    const { suggestions } = req.body;

    if (!Array.isArray(suggestions)) {
      return res.status(400).json({ error: 'suggestions must be an array' });
    }

    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });
    if (!(await teacherOwnsSession(numericId, req.user.id))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    const result = await pool.query(`
      UPDATE session_projects
      SET suggestions = $1::jsonb, updated_at = NOW()
      WHERE id = $2 AND session_id = $3
      RETURNING id, suggestions, updated_at
    `, [JSON.stringify(suggestions), projectId, numericId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project record not found' });
    }

    res.json({ success: true, suggestions: result.rows[0].suggestions, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    logger.error('Error updating project suggestions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /:sessionId/projects/:projectId/publish
// Marks suggestions as published and broadcasts a notification to all students.
// ────────────────────────────────────────────────────────────────────────────
router.post('/:sessionId/projects/:projectId/publish', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId, projectId } = req.params;
    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });
    if (!(await teacherOwnsSession(numericId, req.user.id))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    await pool.query(
      'UPDATE session_projects SET is_published = TRUE, updated_at = NOW() WHERE id = $1 AND session_id = $2',
      [projectId, numericId]
    );

    const sessionRow = await pool.query('SELECT title FROM sessions WHERE id = $1', [numericId]);
    const sessionTitle = sessionRow.rows[0]?.title || 'your session';
    const title = 'New AI Project Suggestions';
    const body = `Your teacher has shared project ideas based on "${sessionTitle}". Check the Projects tab!`;

    // Persist notification
    const notifResult = await pool.query(`
      INSERT INTO session_notifications (session_id, sender_id, type, reference_id, title, body)
      VALUES ($1, $2, 'project_suggestion', $3, $4, $5)
      RETURNING id, created_at
    `, [numericId, req.user.id, projectId, title, body]);

    const notif = notifResult.rows[0];

    // Broadcast via WebSocket
    await broadcastNotification(sessionId, {
      type: 'project-notification',
      notificationId: notif.id,
      notifType: 'project_suggestion',
      referenceId: parseInt(projectId),
      title,
      body,
    });

    res.json({ success: true, notification: { id: notif.id, title, body, createdAt: notif.created_at } });
  } catch (error) {
    logger.error('Error publishing project suggestions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /:sessionId/assignments
// Teacher creates a formal assignment from a project suggestion.
// ────────────────────────────────────────────────────────────────────────────
router.post('/:sessionId/assignments', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { projectId, title, description, difficulty, dueDate } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });
    if (!(await teacherOwnsSession(numericId, req.user.id))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    const safeD = validDifficulties.includes(difficulty) ? difficulty : null;
    const safeDue = dueDate ? new Date(dueDate) : null;

    const assignResult = await pool.query(`
      INSERT INTO project_assignments (session_id, project_id, created_by, title, description, difficulty, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [numericId, projectId || null, req.user.id, title, description, safeD, safeDue]);

    const assignment = assignResult.rows[0];

    // Persist notification
    const notifTitle = `New Assignment: ${title}`;
    const notifBody = `A new assignment has been posted${safeD ? ` — due ${safeDue.toLocaleDateString()}` : ''}. Check the Projects tab to submit.`;

    const notifResult = await pool.query(`
      INSERT INTO session_notifications (session_id, sender_id, type, reference_id, title, body)
      VALUES ($1, $2, 'assignment', $3, $4, $5)
      RETURNING id, created_at
    `, [numericId, req.user.id, assignment.id, notifTitle, notifBody]);

    // Broadcast via WebSocket
    await broadcastNotification(sessionId, {
      type: 'project-notification',
      notificationId: notifResult.rows[0].id,
      notifType: 'assignment',
      referenceId: assignment.id,
      title: notifTitle,
      body: notifBody,
    });

    res.status(201).json({ success: true, assignment });
  } catch (error) {
    logger.error('Error creating assignment', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:sessionId/assignments
// List all active assignments for a session.
// Teachers: see all assignments + submission counts.
// Students: see assignments + own submission status.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId/assignments', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });

    const { role, id: userId } = req.user;

    if (role === 'student') {
      if (!(await studentIsEnrolled(numericId, userId))) {
        return res.status(403).json({ error: 'Access denied: not enrolled in this session' });
      }

      const result = await pool.query(`
        SELECT
          pa.*,
          asub.status AS submission_status,
          asub.submission_type,
          asub.submitted_at
        FROM project_assignments pa
        LEFT JOIN assignment_submissions asub
          ON asub.assignment_id = pa.id AND asub.student_id = $2
        WHERE pa.session_id = $1 AND pa.is_active = TRUE
        ORDER BY pa.created_at DESC
      `, [numericId, userId]);

      return res.json({ assignments: result.rows });
    }

    // Teacher
    if (!(await teacherOwnsSession(numericId, userId))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    const result = await pool.query(`
      SELECT
        pa.*,
        COUNT(asub.id)::int AS submission_count
      FROM project_assignments pa
      LEFT JOIN assignment_submissions asub ON asub.assignment_id = pa.id
      WHERE pa.session_id = $1 AND pa.is_active = TRUE
      GROUP BY pa.id
      ORDER BY pa.created_at DESC
    `, [numericId]);

    res.json({ assignments: result.rows });
  } catch (error) {
    logger.error('Error fetching assignments', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /:sessionId/assignments/:assignmentId/submit
// Student submits a text or file response.
// ────────────────────────────────────────────────────────────────────────────
router.post('/:sessionId/assignments/:assignmentId/submit',
  authenticate,
  authorize('student'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { sessionId, assignmentId } = req.params;
      const numericId = await getNumericSessionId(sessionId);
      if (!numericId) return res.status(404).json({ error: 'Session not found' });

      if (!(await studentIsEnrolled(numericId, req.user.id))) {
        return res.status(403).json({ error: 'Access denied: not enrolled in this session' });
      }

      // Verify assignment belongs to this session
      const assignCheck = await pool.query(
        'SELECT id FROM project_assignments WHERE id = $1 AND session_id = $2 AND is_active = TRUE',
        [assignmentId, numericId]
      );
      if (assignCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Assignment not found or inactive' });
      }

      let submissionType, content = null, fileUrl = null, fileName = null, fileType = null;

      if (req.file) {
        // File submission — upload to Supabase storage
        submissionType = 'file';
        fileName = req.file.originalname;
        fileType = req.file.mimetype.includes('pdf') ? 'pdf'
          : req.file.originalname.endsWith('.docx') ? 'docx' : 'doc';

        const storagePath = `submissions/${assignmentId}/${req.user.id}/${Date.now()}_${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('session-resources')
          .upload(storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          logger.error('Supabase upload failed for submission', { error: uploadError.message, storagePath });
          return res.status(500).json({ error: 'File upload failed. Please try again.' });
        }

        const { data: urlData } = supabase.storage.from('session-resources').getPublicUrl(storagePath);
        fileUrl = urlData?.publicUrl || storagePath;
      } else {
        // Text submission
        const { text } = req.body;
        if (!text || text.trim().length === 0) {
          return res.status(400).json({ error: 'Either a file or text content is required' });
        }
        submissionType = 'text';
        content = text.trim();
      }

      // Upsert — handles resubmissions cleanly
      const result = await pool.query(`
        INSERT INTO assignment_submissions
          (assignment_id, student_id, submission_type, content, file_url, file_name, file_type, status, submitted_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', NOW(), NOW())
        ON CONFLICT (assignment_id, student_id)
        DO UPDATE SET
          submission_type = $3, content = $4, file_url = $5,
          file_name = $6, file_type = $7, status = 'submitted',
          submitted_at = NOW(), updated_at = NOW()
        RETURNING *
      `, [assignmentId, req.user.id, submissionType, content, fileUrl, fileName, fileType]);

      // Award XP (idempotent — only once per student per session)
      await awardSubmissionXP(req.user.id, numericId);

      res.json({ success: true, submission: result.rows[0] });
    } catch (error) {
      logger.error('Error submitting assignment', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// GET /:sessionId/assignments/:assignmentId/submissions
// Teacher views all submissions for an assignment.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId/assignments/:assignmentId/submissions', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId, assignmentId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });
    if (!(await teacherOwnsSession(numericId, req.user.id))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    const [rows, countRow] = await Promise.all([
      pool.query(`
        SELECT
          asub.*,
          u.full_name AS student_name,
          u.email AS student_email
        FROM assignment_submissions asub
        JOIN users u ON asub.student_id = u.id
        WHERE asub.assignment_id = $1
        ORDER BY asub.submitted_at DESC
        LIMIT $2 OFFSET $3
      `, [assignmentId, limit, offset]),
      pool.query('SELECT COUNT(*) AS total FROM assignment_submissions WHERE assignment_id = $1', [assignmentId]),
    ]);

    res.json({
      submissions: rows.rows,
      total: parseInt(countRow.rows[0].total),
      page,
      limit,
    });
  } catch (error) {
    logger.error('Error fetching submissions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /:sessionId/assignments/:assignmentId
// Teacher removes (deactivates) an assignment. Students no longer see it.
// ────────────────────────────────────────────────────────────────────────────
router.delete('/:sessionId/assignments/:assignmentId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { sessionId, assignmentId } = req.params;
    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });
    if (!(await teacherOwnsSession(numericId, req.user.id))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    const result = await pool.query(
      'UPDATE project_assignments SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND session_id = $2 RETURNING id',
      [assignmentId, numericId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing assignment', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /:sessionId/notifications
// Fetch persistent session notifications (rehydrates NotificationContext on load).
// Both roles; filtered by role for relevance.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId/notifications', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { since } = req.query; // ISO timestamp — fetch notifications after this point

    const numericId = await getNumericSessionId(sessionId);
    if (!numericId) return res.status(404).json({ error: 'Session not found' });

    const { role, id: userId } = req.user;
    if (role === 'student' && !(await studentIsEnrolled(numericId, userId))) {
      return res.status(403).json({ error: 'Access denied: not enrolled in this session' });
    }
    if (role === 'teacher' && !(await teacherOwnsSession(numericId, userId))) {
      return res.status(403).json({ error: 'Access denied: not your session' });
    }

    const sinceDate = since ? new Date(since) : new Date(0);

    const result = await pool.query(`
      SELECT id, type, reference_id, title, body, created_at
      FROM session_notifications
      WHERE session_id = $1 AND created_at > $2
      ORDER BY created_at DESC
      LIMIT 50
    `, [numericId, sinceDate]);

    res.json({ notifications: result.rows });
  } catch (error) {
    logger.error('Error fetching session notifications', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

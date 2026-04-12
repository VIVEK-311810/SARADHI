/**
 * Shared session helper functions used across multiple route files.
 * Centralises repeated DB queries that were previously copy-pasted.
 */

const pool = require('../../db');

// ── resolve alphanumeric session_id → numeric DB id ─────────────────────────
async function getNumericSessionId(stringSessionId) {
  const result = await pool.query(
    'SELECT id FROM sessions WHERE session_id = $1',
    [stringSessionId.toUpperCase()]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// ── verify student is enrolled in a session (uses numeric session id) ────────
async function studentIsEnrolled(numericSessionId, studentId) {
  const r = await pool.query(
    'SELECT 1 FROM session_participants WHERE session_id = $1 AND student_id = $2',
    [numericSessionId, studentId]
  );
  return r.rows.length > 0;
}

// ── verify teacher owns a session (uses numeric session id) ──────────────────
async function teacherOwnsSession(numericSessionId, teacherId) {
  const r = await pool.query(
    'SELECT 1 FROM sessions WHERE id = $1 AND teacher_id = $2',
    [numericSessionId, teacherId]
  );
  return r.rows.length > 0;
}

// ── verify teacher owns a session (uses string session_id) ───────────────────
// Used by transcription routes where only the string code is available.
async function verifySessionOwnership(stringSessionId, teacherId) {
  const result = await pool.query(
    'SELECT 1 FROM sessions WHERE session_id = $1 AND teacher_id = $2',
    [stringSessionId.toUpperCase(), teacherId]
  );
  return result.rows.length > 0;
}

module.exports = {
  getNumericSessionId,
  studentIsEnrolled,
  teacherOwnsSession,
  verifySessionOwnership,
};

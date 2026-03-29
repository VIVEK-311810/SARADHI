const pool = require('../db');

/**
 * Resolve a 6-char string session_id to its numeric DB id.
 * Returns null if not found.
 * @param {string} code
 * @returns {Promise<number|null>}
 */
async function getSessionByCode(code) {
  const result = await pool.query(
    'SELECT * FROM sessions WHERE session_id = $1',
    [code.toUpperCase()]
  );
  return result.rows[0] || null;
}

/**
 * Paginated list of sessions for a teacher with participant + poll counts.
 * @param {string} teacherId
 * @param {number} page  1-based
 * @param {number} limit max 100
 * @returns {Promise<{ sessions: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function getTeacherSessions(teacherId, page = 1, limit = 20) {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const [result, countResult] = await Promise.all([
    pool.query(`
      SELECT
        s.*,
        COALESCE(participant_counts.participant_count, 0) as participant_count,
        COALESCE(poll_counts.poll_count, 0) as poll_count
      FROM sessions s
      LEFT JOIN (
        SELECT session_id, COUNT(*) as participant_count
        FROM session_participants GROUP BY session_id
      ) participant_counts ON s.id = participant_counts.session_id
      LEFT JOIN (
        SELECT session_id, COUNT(*) as poll_count FROM polls GROUP BY session_id
      ) poll_counts ON s.id = poll_counts.session_id
      WHERE s.teacher_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `, [teacherId, safeLimit, offset]),
    pool.query('SELECT COUNT(*) as total FROM sessions WHERE teacher_id = $1', [teacherId])
  ]);

  const total = parseInt(countResult.rows[0].total);
  return {
    sessions: result.rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit)
  };
}

/**
 * Insert a new session and return the created row.
 * @param {string} title
 * @param {string} courseName
 * @param {string} teacherId
 * @returns {Promise<object>}
 */
async function createSession(title, courseName, teacherId) {
  const result = await pool.query(
    'INSERT INTO sessions (title, course_name, teacher_id, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, courseName, teacherId, true]
  );
  return result.rows[0];
}

/**
 * Update is_active / is_live status flags for a session.
 * Returns the updated row or null if not found / not owned.
 * @param {string} code   6-char session_id
 * @param {string} teacherId
 * @param {{ isActive?: boolean, isLive?: boolean }} flags
 * @returns {Promise<object|null>}
 */
async function updateSessionStatus(code, teacherId, { isActive, isLive } = {}) {
  const updates = [];
  const values = [];
  let idx = 1;

  if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive); }
  if (isLive !== undefined)   { updates.push(`is_live = $${idx++}`); values.push(isLive); }
  if (updates.length === 0) return null;

  values.push(code.toUpperCase(), teacherId);
  const result = await pool.query(
    `UPDATE sessions SET ${updates.join(', ')} WHERE session_id = $${idx} AND teacher_id = $${idx + 1} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

module.exports = { getSessionByCode, getTeacherSessions, createSession, updateSessionStatus };

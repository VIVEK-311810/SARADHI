const WebSocket = require('ws');

/**
 * Initialize the WebSocket server with all session, poll, attendance, and
 * dashboard handlers. Exposes broadcast helpers and timer state on global so
 * route modules (polls.js, sessions.js, etc.) can trigger broadcasts.
 *
 * @param {WebSocket.Server} wss
 * @param {{ pool, redis, redisPub, redisSub, logger }} deps
 * @returns {{ restoreActivePolls, restoreAttendanceWindows }}
 */
function initWebSocket(wss, { pool, redis, redisPub, redisSub, logger }) {
  // ── Per-session state ─────────────────────────────────────────────────────
  const sessionConnections = new Map();
  const pendingHeartbeats = new Map();
  const revealInProgressLocal = new Set();
  const attendanceWindows = new Map();
  const dashboardConnections = new Map();

  // Competition room connections: roomCode → Map<userId (string), WebSocket>
  const competitionConnections = new Map();
  // In-memory room state: roomCode → { status, currentQuestionIndex, questionStartTime, allQuestions, timePerQuestion, totalQuestions, timerHandles }
  const competitionRoomState = new Map();

  // ── Poll timer state (globally accessible for routes/polls.js) ────────────
  global.pollTimers = global.pollTimers || new Map();
  global.activePollEndTimes = global.activePollEndTimes || new Map();

  global.clearPollTimer = function (sessionId) {
    try {
      const normalizedSessionId = sessionId.toUpperCase();
      if (global.pollTimers && global.pollTimers.has(normalizedSessionId)) {
        clearTimeout(global.pollTimers.get(normalizedSessionId));
        global.pollTimers.delete(normalizedSessionId);
      }
      if (global.activePollEndTimes && global.activePollEndTimes.has(normalizedSessionId)) {
        global.activePollEndTimes.delete(normalizedSessionId);
      }
    } catch (e) {
      logger.error('Error clearing poll timer', { error: e.message });
    }
  };

  // ── Atomic poll reveal guard ───────────────────────────────────────────────
  async function claimPollReveal(pollId) {
    if (redis) {
      const result = await redis.set(`reveal:${pollId}`, '1', 'EX', 30, 'NX').catch(() => null);
      return result === 'OK';
    }
    if (revealInProgressLocal.has(pollId)) return false;
    revealInProgressLocal.add(pollId);
    setTimeout(() => revealInProgressLocal.delete(pollId), 30000);
    return true;
  }

  // ── Poll timer Redis caching ───────────────────────────────────────────────
  async function cachePollTimerState(sessionId, pollId, pollEndTime, poll) {
    if (!redis) return;
    await redis.setex(
      `poll:timer:${sessionId}`,
      Math.max(10, Math.ceil((pollEndTime - Date.now()) / 1000) + 30),
      JSON.stringify({ pollId, pollEndTime, poll })
    ).catch(() => {});
  }

  async function clearPollTimerState(sessionId) {
    if (redis) await redis.del(`poll:timer:${sessionId}`).catch(() => {});
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────

  async function broadcastToSession(sessionId, message) {
    const payload = JSON.stringify(message);
    if (redisPub) {
      await redisPub.publish(`session:${sessionId}`, payload).catch((err) => {
        logger.warn('Redis publish failed, falling back to local broadcast', { error: err.message });
        _localBroadcast(sessionId, payload);
      });
    } else {
      _localBroadcast(sessionId, payload);
    }
  }

  function _localBroadcast(sessionId, payload) {
    const connections = sessionConnections.get(sessionId);
    if (!connections || connections.length === 0) return;
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
  }

  async function broadcastToDashboardsForSession(sessionIdStr, message) {
    try {
      const sessionResult = await pool.query(
        'SELECT id FROM sessions WHERE session_id = $1',
        [sessionIdStr.toUpperCase()]
      );
      if (sessionResult.rows.length === 0) return;
      const numericId = sessionResult.rows[0].id;

      const participants = await pool.query(
        'SELECT student_id FROM session_participants WHERE session_id = $1',
        [numericId]
      );
      logger.info('broadcastToDashboards', {
        sessionId: sessionIdStr,
        participants: participants.rows.length,
        dashboardConnections: dashboardConnections.size,
        participantIds: participants.rows.map(r => String(r.student_id)),
        connectedIds: Array.from(dashboardConnections.keys())
      });
      const payload = JSON.stringify(message);
      for (const row of participants.rows) {
        const conns = dashboardConnections.get(String(row.student_id));
        if (conns) {
          for (const conn of conns) {
            if (conn.readyState === WebSocket.OPEN) conn.send(payload);
          }
        }
      }
    } catch (err) {
      logger.error('broadcastToDashboardsForSession error', { error: err.message });
    }
  }

  async function broadcastPollToSession(sessionId, message) {
    try {
      const attendanceCheck = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE sp.attendance_status IS NOT NULL) as has_attendance
         FROM session_participants sp
         JOIN sessions s ON sp.session_id = s.id
         WHERE s.session_id = $1`,
        [sessionId]
      );

      const attendanceTaken = parseInt(attendanceCheck.rows[0]?.has_attendance || 0) > 0;

      if (!attendanceTaken) {
        await broadcastToSession(sessionId, message);
        return;
      }

      const eligibleResult = await pool.query(
        `SELECT sp.student_id
         FROM session_participants sp
         JOIN sessions s ON sp.session_id = s.id
         WHERE s.session_id = $1
         AND sp.attendance_status IN ('present', 'late')`,
        [sessionId]
      );
      const eligibleIds = eligibleResult.rows.map(r => String(r.student_id));

      const payload = JSON.stringify({ ...message, _eligibleIds: eligibleIds });

      if (redisPub) {
        await redisPub.publish(`session:${sessionId}`, payload).catch((err) => {
          logger.warn('Redis publish failed in broadcastPollToSession, falling back', { error: err.message });
          _localFilteredBroadcast(sessionId, message, new Set(eligibleIds));
        });
      } else {
        _localFilteredBroadcast(sessionId, message, new Set(eligibleIds));
      }
    } catch (error) {
      logger.error('Error in broadcastPollToSession, falling back to full broadcast', { error: error.message });
      await broadcastToSession(sessionId, message);
    }
  }

  function _localFilteredBroadcast(sessionId, message, eligibleIds) {
    const connections = sessionConnections.get(sessionId);
    if (!connections || connections.length === 0) return;
    const payload = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const isTeacher = ws.userRole === 'teacher';
      const isEligible = eligibleIds.has(String(ws.userId));
      if (isTeacher || isEligible) ws.send(payload);
    });
  }

  // Expose broadcast helpers globally for route modules
  global.broadcastToSession = broadcastToSession;
  global.broadcastToDashboardsForSession = broadcastToDashboardsForSession;
  global.broadcastPollToSession = broadcastPollToSession;
  global.sessionConnections = sessionConnections;
  global.competitionConnections = competitionConnections;
  global.competitionRoomState = competitionRoomState;

  // ── Redis pub/sub fan-out ─────────────────────────────────────────────────
  if (redisSub) {
    redisSub.psubscribe('session:*', (err) => {
      if (err) logger.error('Redis psubscribe error', { error: err.message });
      else logger.info('Redis pub/sub: subscribed to session:* channels');
    });

    redisSub.on('pmessage', (pattern, channel, rawPayload) => {
      const sessionId = channel.replace('session:', '');
      const connections = sessionConnections.get(sessionId);
      if (!connections || connections.length === 0) return;

      let parsed;
      let eligibleIds = null;
      try {
        parsed = JSON.parse(rawPayload);
        if (parsed._eligibleIds) {
          eligibleIds = new Set(parsed._eligibleIds);
          const { _eligibleIds, ...clientMsg } = parsed;
          rawPayload = JSON.stringify(clientMsg);
        }
      } catch (_) { /* send as-is */ }

      connections.forEach(ws => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (eligibleIds) {
          const isTeacher = ws.userRole === 'teacher';
          const isEligible = eligibleIds.has(String(ws.userId));
          if (!isTeacher && !isEligible) return;
        }
        ws.send(rawPayload);
      });
    });
  }

  // ── Timer reveal ──────────────────────────────────────────────────────────
  async function triggerAnswerRevealFromTimer(sessionId, pollId) {
    try {
      const normalizedSessionId = sessionId.toUpperCase();

      const claimed = await claimPollReveal(pollId);
      if (!claimed) {
        logger.info('Poll reveal already claimed by another instance, skipping', { pollId });
        return;
      }
      const activePollData = global.activePollEndTimes.get(normalizedSessionId);

      const revealMessage = {
        type: 'reveal-answers',
        sessionId: normalizedSessionId,
        pollId,
        reason: 'time-expired',
        server_time: Date.now(),
        poll_end_time: activePollData ? activePollData.pollEndTime : Date.now()
      };

      const pollResult = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
      if (pollResult.rows.length > 0) {
        const poll = pollResult.rows[0];
        revealMessage.correctAnswer = poll.correct_answer;
        revealMessage.poll = poll;
      }

      await broadcastPollToSession(normalizedSessionId, revealMessage);
      logger.info('Answer reveal broadcast (timer expiry)', { pollId, sessionId: normalizedSessionId });

      await pool.query('UPDATE polls SET is_active = FALSE WHERE id = $1', [pollId]);

      try {
        const { getSessionLeaderboard } = require('../routes/gamification');
        const sessionDbResult = await pool.query('SELECT id FROM sessions WHERE session_id = $1', [normalizedSessionId]);
        if (sessionDbResult.rows.length > 0) {
          const dbSessionId = sessionDbResult.rows[0].id;
          const leaderboard = await getSessionLeaderboard(dbSessionId, 50);
          broadcastToSession(normalizedSessionId, {
            type: 'leaderboard-update',
            leaderboard
          });
          broadcastToDashboardsForSession(normalizedSessionId, { type: 'stats-updated' }).catch(() => {});
        }
      } catch (lbErr) {
        logger.warn('Failed to broadcast leaderboard update', { error: lbErr.message });
      }
    } catch (error) {
      logger.error('Error triggering timer-based answer reveal', { error: error.message, pollId, sessionId });
    }
  }

  // ── Poll activation ───────────────────────────────────────────────────────
  async function handleActivatePoll(data) {
    const { sessionId, poll } = data;
    const normalizedSessionId = sessionId.toUpperCase();

    const serverTime = Date.now();
    const timeLimitMs = (poll.time_limit || 60) * 1000;
    const pollEndTime = serverTime + timeLimitMs;

    pool.query('UPDATE polls SET ends_at = $1 WHERE id = $2', [new Date(pollEndTime), poll.id])
      .catch(err => logger.error('Failed to persist poll ends_at', { error: err.message }));

    global.activePollEndTimes.set(normalizedSessionId, { pollId: poll.id, pollEndTime, poll });

    await cachePollTimerState(normalizedSessionId, poll.id, pollEndTime, poll);

    await broadcastPollToSession(normalizedSessionId, {
      type: 'poll-activated',
      poll,
      poll_end_time: pollEndTime,
      server_time: serverTime
    });

    if (global.pollTimers.has(normalizedSessionId)) {
      clearTimeout(global.pollTimers.get(normalizedSessionId));
    }

    const timer = setTimeout(async () => {
      await triggerAnswerRevealFromTimer(normalizedSessionId, poll.id);
      global.pollTimers.delete(normalizedSessionId);
      global.activePollEndTimes.delete(normalizedSessionId);
      await clearPollTimerState(normalizedSessionId);
    }, timeLimitMs);

    global.pollTimers.set(normalizedSessionId, timer);
    logger.info('Poll activated', { pollId: poll.id, sessionId: normalizedSessionId, endsAt: new Date(pollEndTime).toISOString() });
  }

  // ── Heartbeat batching ────────────────────────────────────────────────────
  function handleHeartbeat(data) {
    if (!data.sessionId || !data.studentId) return;
    pendingHeartbeats.set(`${data.sessionId}:${data.studentId}`, Date.now());
  }

  setInterval(async () => {
    if (pendingHeartbeats.size === 0) return;

    const entries = [...pendingHeartbeats.entries()];
    pendingHeartbeats.clear();

    try {
      const values = entries.map(([key, ts]) => {
        const [sessionId, studentId] = key.split(':');
        return { sessionId, studentId, ts };
      });

      const sessionGroups = new Map();
      for (const { sessionId, studentId, ts } of values) {
        if (!sessionGroups.has(sessionId)) sessionGroups.set(sessionId, []);
        sessionGroups.get(sessionId).push({ studentId, ts });
      }

      await Promise.all([...sessionGroups.entries()].map(([sessionId, students]) => {
        const studentIds = students.map(s => s.studentId);
        return pool.query(
          `UPDATE session_participants
           SET last_activity = CURRENT_TIMESTAMP
           WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
           AND student_id = ANY($2::text[])`,
          [sessionId, studentIds]
        );
      }));
    } catch (error) {
      logger.error('Heartbeat batch flush failed', { error: error.message });
    }
  }, 30000);

  // ── Join session ──────────────────────────────────────────────────────────
  async function handleJoinSession(ws, data) {
    const { sessionId } = data;
    const studentId = ws.userId;
    const normalizedSessionId = sessionId.toUpperCase();

    if (!sessionConnections.has(normalizedSessionId)) {
      sessionConnections.set(normalizedSessionId, []);
    }

    sessionConnections.get(normalizedSessionId).push(ws);
    ws.sessionId = normalizedSessionId;
    ws.studentId = studentId;

    if (ws.userRole === 'student') {
      pool.query(
        `INSERT INTO session_participants (session_id, student_id, connection_status, is_active)
         VALUES ((SELECT id FROM sessions WHERE session_id = $1), $2, 'online', true)
         ON CONFLICT (session_id, student_id)
         DO UPDATE SET connection_status = 'online', is_active = true, last_activity = CURRENT_TIMESTAMP`,
        [normalizedSessionId, studentId]
      ).catch(err => logger.error('Error upserting session participant on WS join', { error: err.message }));
    }

    logger.info('User joined session', { userId: studentId, role: ws.userRole, sessionId: normalizedSessionId });

    ws.send(JSON.stringify({
      type: 'session-joined',
      sessionId: normalizedSessionId,
      message: 'Successfully joined session'
    }));

    const studentCount = sessionConnections.get(normalizedSessionId).filter(c => c.userRole === 'student').length;
    broadcastToSession(normalizedSessionId, {
      type: 'participant-count-updated',
      count: studentCount
    });

    const activePollData = global.activePollEndTimes.get(normalizedSessionId);
    if (activePollData) {
      const currentTime = Date.now();
      if (activePollData.pollEndTime > currentTime) {
        ws.send(JSON.stringify({
          type: 'poll-activated',
          poll: activePollData.poll,
          poll_end_time: activePollData.pollEndTime,
          server_time: currentTime
        }));
      } else {
        global.activePollEndTimes.delete(normalizedSessionId);
      }
    }

    try {
      const activeWindow = attendanceWindows.get(normalizedSessionId);
      if (!activeWindow) {
        const attendanceCheck = await pool.query(
          `SELECT COUNT(*) as cnt FROM session_participants
           WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
           AND attendance_status IS NOT NULL`,
          [normalizedSessionId]
        );
        if (parseInt(attendanceCheck.rows[0].cnt) > 0) {
          const updateResult = await pool.query(
            `UPDATE session_participants
             SET attendance_status = 'late', attendance_marked_at = CURRENT_TIMESTAMP
             WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
             AND student_id = $2
             AND attendance_status = 'absent'
             RETURNING id`,
            [normalizedSessionId, ws.userId]
          );
          if (updateResult.rows.length > 0) {
            ws.send(JSON.stringify({
              type: 'attendance-late-join',
              message: 'You joined after the attendance window closed and have been marked as late.'
            }));
            logger.info('Late joiner marked', { userId: ws.userId, sessionId: normalizedSessionId });
          }
        }
      }
    } catch (error) {
      logger.error('Error handling late attendance join', { error: error.message });
    }
  }

  // ── Attendance handlers ───────────────────────────────────────────────────
  async function getAttendanceCounts(numericSessionId) {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE attendance_status = 'present') AS present,
         COUNT(*) FILTER (WHERE attendance_status = 'late')    AS late,
         COUNT(*) FILTER (WHERE attendance_status = 'absent')  AS absent
       FROM session_participants
       WHERE session_id = $1`,
      [numericSessionId]
    );
    const row = result.rows[0];
    return {
      present: parseInt(row.present) || 0,
      late: parseInt(row.late) || 0,
      absent: parseInt(row.absent) || 0
    };
  }

  async function broadcastAttendanceCounts(normalizedSessionId) {
    try {
      const sessionResult = await pool.query(
        'SELECT id FROM sessions WHERE session_id = $1',
        [normalizedSessionId]
      );
      if (sessionResult.rows.length === 0) return;
      const counts = await getAttendanceCounts(sessionResult.rows[0].id);
      broadcastToSession(normalizedSessionId, {
        type: 'attendance-count-updated',
        counts
      });
    } catch (error) {
      logger.error('Error broadcasting attendance counts', { error: error.message });
    }
  }

  async function closeAttendanceWindow(normalizedSessionId, numericSessionId) {
    attendanceWindows.delete(normalizedSessionId);

    await pool.query(
      'UPDATE session_attendance_windows SET is_active = FALSE, closed_at = CURRENT_TIMESTAMP WHERE session_id = $1 AND is_active = TRUE',
      [numericSessionId]
    );

    const counts = await getAttendanceCounts(numericSessionId);

    broadcastToSession(normalizedSessionId, {
      type: 'attendance-closed',
      sessionId: normalizedSessionId,
      counts
    });

    logger.info('Attendance window closed', { sessionId: normalizedSessionId, counts });
  }

  async function handleOpenAttendance(ws, data) {
    if (ws.userRole !== 'teacher') return;

    const { sessionId, durationSeconds = 60 } = data;
    const normalizedSessionId = sessionId.toUpperCase();
    const duration = Math.min(300, Math.max(10, parseInt(durationSeconds) || 60));

    try {
      const sessionResult = await pool.query(
        'SELECT id FROM sessions WHERE session_id = $1',
        [normalizedSessionId]
      );
      if (sessionResult.rows.length === 0) return;
      const numericSessionId = sessionResult.rows[0].id;

      await pool.query(
        'UPDATE session_attendance_windows SET is_active = FALSE, closed_at = CURRENT_TIMESTAMP WHERE session_id = $1 AND is_active = TRUE',
        [numericSessionId]
      );

      const windowResult = await pool.query(
        'INSERT INTO session_attendance_windows (session_id, duration_seconds, opened_by, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id',
        [numericSessionId, duration, ws.userId]
      );
      const windowId = windowResult.rows[0].id;
      const closesAt = Date.now() + duration * 1000;

      attendanceWindows.set(normalizedSessionId, {
        windowId,
        closesAt,
        markedStudentIds: new Set()
      });

      await pool.query(
        `UPDATE session_participants
         SET attendance_status = 'absent', attendance_marked_at = NULL
         WHERE session_id = $1`,
        [numericSessionId]
      );

      broadcastToSession(normalizedSessionId, {
        type: 'attendance-opened',
        sessionId: normalizedSessionId,
        windowId,
        durationSeconds: duration,
        closesAt,
        server_time: Date.now()
      });

      logger.info('Attendance window opened', { sessionId: normalizedSessionId, windowId, duration });

      setTimeout(async () => {
        const current = attendanceWindows.get(normalizedSessionId);
        if (current && current.windowId === windowId) {
          await closeAttendanceWindow(normalizedSessionId, numericSessionId);
        }
      }, duration * 1000);
    } catch (error) {
      logger.error('Error opening attendance window', { error: error.message });
    }
  }

  async function handleMarkAttendance(ws, data) {
    if (ws.userRole !== 'student') return;

    const normalizedSessionId = (ws.sessionId || '').toUpperCase();
    const userId = ws.userId;

    const window = attendanceWindows.get(normalizedSessionId);
    if (!window) {
      ws.send(JSON.stringify({ type: 'attendance-mark-failed', reason: 'No active attendance window' }));
      return;
    }
    if (Date.now() > window.closesAt) {
      ws.send(JSON.stringify({ type: 'attendance-mark-failed', reason: 'Attendance window has closed' }));
      return;
    }
    if (window.markedStudentIds.has(userId)) {
      ws.send(JSON.stringify({ type: 'attendance-mark-ack', status: 'present', alreadyMarked: true }));
      return;
    }

    try {
      await pool.query(
        `UPDATE session_participants
         SET attendance_status = 'present', attendance_marked_at = CURRENT_TIMESTAMP
         WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
         AND student_id = $2`,
        [normalizedSessionId, userId]
      );

      window.markedStudentIds.add(userId);

      ws.send(JSON.stringify({
        type: 'attendance-mark-ack',
        status: 'present',
        markedAt: new Date().toISOString()
      }));

      await broadcastAttendanceCounts(normalizedSessionId);

      logger.info('Student marked attendance present', { userId, sessionId: normalizedSessionId });
    } catch (error) {
      logger.error('Error marking attendance', { error: error.message });
    }
  }

  async function handleCloseAttendance(ws, data) {
    if (ws.userRole !== 'teacher') return;
    const normalizedSessionId = ((data && data.sessionId) || ws.sessionId || '').toUpperCase();

    try {
      const sessionResult = await pool.query(
        'SELECT id FROM sessions WHERE session_id = $1',
        [normalizedSessionId]
      );
      if (sessionResult.rows.length === 0) return;
      await closeAttendanceWindow(normalizedSessionId, sessionResult.rows[0].id);
    } catch (error) {
      logger.error('Error closing attendance window', { error: error.message });
    }
  }

  // ── Competition WebSocket Helpers ─────────────────────────────────────────

  function broadcastToCompetitionRoom(roomCode, message) {
    const roomMap = competitionConnections.get(roomCode);
    if (!roomMap) return;
    const payload = JSON.stringify(message);
    for (const ws of roomMap.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  async function handleJoinCompetition(ws, data) {
    const { roomCode } = data;
    const role = data.role || 'player';
    if (!competitionConnections.has(roomCode)) {
      competitionConnections.set(roomCode, new Map());
    }
    competitionConnections.get(roomCode).set(String(ws.userId), ws);
    ws.competitionRoomCode = roomCode;
    ws.competitionRole = role;

    const roomResult = await pool.query(
      'SELECT id FROM competition_rooms WHERE room_code = $1',
      [roomCode]
    );
    if (roomResult.rows.length === 0) return;
    const participants = await pool.query(
      `SELECT cp.student_id, u.full_name AS display_name, cp.role, cp.score, cp.correct_count, cp.questions_answered
       FROM competition_participants cp
       JOIN users u ON cp.student_id = u.id
       WHERE cp.room_id = $1
       ORDER BY cp.score DESC`,
      [roomResult.rows[0].id]
    );
    broadcastToCompetitionRoom(roomCode, {
      type: 'competition-player-joined',
      participants: participants.rows
    });
  }

  async function handleStartCompetition(ws, data) {
    const { roomCode } = data;

    const roomResult = await pool.query(
      'SELECT * FROM competition_rooms WHERE room_code = $1',
      [roomCode]
    );
    if (roomResult.rows.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }
    const room = roomResult.rows[0];
    if (String(room.created_by) !== String(ws.userId)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Only the room creator can start the competition' }));
      return;
    }
    if (room.status !== 'waiting') {
      ws.send(JSON.stringify({ type: 'error', message: 'Competition already started or finished' }));
      return;
    }

    // Fetch teacher polls — use specific IDs if stored, else fall back to count limit
    let pollsResult;
    const storedPollIds = Array.isArray(room.teacher_poll_ids) && room.teacher_poll_ids.length > 0
      ? room.teacher_poll_ids : null;
    if (storedPollIds) {
      pollsResult = await pool.query(
        `SELECT p.id, p.question, p.options, p.correct_answer, p.justification
         FROM polls p
         JOIN sessions s ON p.session_id = s.id
         WHERE s.session_id = $1 AND p.correct_answer IS NOT NULL AND p.id = ANY($2)
         ORDER BY p.created_at ASC`,
        [room.session_id, storedPollIds]
      );
    } else if (room.teacher_question_count > 0) {
      pollsResult = await pool.query(
        `SELECT p.id, p.question, p.options, p.correct_answer, p.justification
         FROM polls p
         JOIN sessions s ON p.session_id = s.id
         WHERE s.session_id = $1 AND p.correct_answer IS NOT NULL
         ORDER BY p.created_at ASC
         LIMIT $2`,
        [room.session_id, room.teacher_question_count]
      );
    } else {
      pollsResult = await pool.query(
        `SELECT p.id, p.question, p.options, p.correct_answer, p.justification
         FROM polls p
         JOIN sessions s ON p.session_id = s.id
         WHERE s.session_id = $1 AND p.correct_answer IS NOT NULL
         ORDER BY p.created_at ASC`,
        [room.session_id]
      );
    }
    const normalizedPolls = pollsResult.rows.map(p => ({
      ...p,
      options: Array.isArray(p.options) ? p.options : JSON.parse(p.options)
    }));

    // Fetch AI-generated student questions — filter by selected IDs if provided
    const selectedIds = Array.isArray(room.student_question_ids) && room.student_question_ids.length > 0
      ? room.student_question_ids : null;
    const studentQResult = selectedIds
      ? await pool.query(
          `SELECT id, question, options, correct_answer, justification
           FROM student_questions
           WHERE session_id = $1 AND id = ANY($2)
           ORDER BY created_at ASC`,
          [room.session_id, selectedIds]
        )
      : await pool.query(
          `SELECT id, question, options, correct_answer, justification
           FROM student_questions
           WHERE session_id = $1
           ORDER BY created_at ASC`,
          [room.session_id]
        );
    const studentQs = studentQResult.rows.map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : JSON.parse(q.options)
    }));

    // Cap AI questions to fill remaining slots up to total_questions
    const teacherLimit = (room.teacher_question_count > 0)
      ? room.teacher_question_count : normalizedPolls.length;
    const selectedPolls = normalizedPolls.slice(0, teacherLimit);
    const totalCap = room.total_questions > 0 ? room.total_questions : selectedPolls.length + studentQs.length;
    const aiSlots = Math.max(0, totalCap - selectedPolls.length);
    const allQuestions = [...selectedPolls, ...studentQs.slice(0, aiSlots)];

    competitionRoomState.set(roomCode, {
      status: 'active',
      currentQuestionIndex: -1,
      questionStartTime: null,
      allQuestions,
      timePerQuestion: room.time_per_question,
      totalQuestions: allQuestions.length,
      timerHandles: []
    });

    await pool.query(
      `UPDATE competition_rooms
       SET status = 'active', total_questions = $1, started_at = NOW()
       WHERE room_code = $2`,
      [allQuestions.length, roomCode]
    );

    broadcastToCompetitionRoom(roomCode, {
      type: 'competition-started',
      totalQuestions: allQuestions.length
    });

    await revealNextCompetitionQuestion(roomCode);
  }

  async function handleCompetitionAnswer(ws, data) {
    const { roomCode, answerIndex, questionIndex } = data;
    const state = competitionRoomState.get(roomCode);
    if (!state || state.status !== 'active') return;

    const responseTimeMs = Math.min(
      Date.now() - (state.questionStartTime || Date.now()),
      state.timePerQuestion * 1000
    );

    const q = state.allQuestions[questionIndex];
    if (!q) return;

    const isCorrect = answerIndex === q.correct_answer;
    let pointsEarned = 0;
    if (isCorrect) {
      const basePoints = 100;
      const speedBonus = Math.floor(
        Math.max(0, (state.timePerQuestion * 1000 - responseTimeMs) / (state.timePerQuestion * 1000)) * 50
      );
      pointsEarned = basePoints + speedBonus;
    }

    const roomResult = await pool.query(
      'SELECT id FROM competition_rooms WHERE room_code = $1',
      [roomCode]
    );
    if (roomResult.rows.length === 0) return;
    const roomId = roomResult.rows[0].id;

    await pool.query(
      `WITH inserted AS (
         INSERT INTO competition_answers
           (room_id, student_id, poll_id, question_index, answer_index, is_correct, response_time_ms, points_earned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (room_id, student_id, question_index) DO NOTHING
         RETURNING id
       )
       UPDATE competition_participants
       SET score              = score + $8,
           correct_count      = correct_count + $9,
           questions_answered = questions_answered + 1
       WHERE room_id = $1 AND student_id = $2
         AND EXISTS (SELECT 1 FROM inserted)`,
      [
        roomId,
        ws.userId,
        q.id || null,
        questionIndex,
        answerIndex,
        isCorrect,
        responseTimeMs,
        pointsEarned,
        isCorrect ? 1 : 0
      ]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM competition_answers WHERE room_id = $1 AND question_index = $2`,
      [roomId, questionIndex]
    );
    const playerCount = await pool.query(
      `SELECT COUNT(*) FROM competition_participants WHERE room_id = $1 AND role = 'player'`,
      [roomId]
    );

    broadcastToCompetitionRoom(roomCode, {
      type: 'competition-answer-received',
      answeredCount: parseInt(countResult.rows[0].count),
      totalPlayers: parseInt(playerCount.rows[0].count)
    });
  }

  function handleLeaveCompetition(ws, data) {
    const roomCode = (data && data.roomCode) || ws.competitionRoomCode;
    if (!roomCode) return;
    const roomMap = competitionConnections.get(roomCode);
    if (roomMap) roomMap.delete(String(ws.userId));
  }

  async function revealNextCompetitionQuestion(roomCode) {
    const state = competitionRoomState.get(roomCode);
    if (!state) return;

    state.currentQuestionIndex++;

    if (state.currentQuestionIndex >= state.totalQuestions) {
      await endCompetition(roomCode);
      return;
    }

    const q = state.allQuestions[state.currentQuestionIndex];
    state.questionStartTime = Date.now();
    const questionIndex = state.currentQuestionIndex;

    await pool.query(
      `UPDATE competition_rooms
       SET current_question_index = $1, question_start_time = $2
       WHERE room_code = $3`,
      [questionIndex, state.questionStartTime, roomCode]
    );

    broadcastToCompetitionRoom(roomCode, {
      type: 'competition-question',
      questionIndex,
      totalQuestions: state.totalQuestions,
      question_text: q.question,
      options: q.options,
      timePerQuestion: state.timePerQuestion,
      questionStartTime: state.questionStartTime,
      endTime: state.questionStartTime + state.timePerQuestion * 1000
    });

    const revealHandle = setTimeout(async () => {
      try {
        const revealRoomResult = await pool.query(
          'SELECT id FROM competition_rooms WHERE room_code = $1',
          [roomCode]
        );
        let revealScores = [];
        if (revealRoomResult.rows.length > 0) {
          const scoresResult = await pool.query(
            `SELECT cp.student_id, u.full_name AS display_name, cp.score,
                    cp.correct_count, cp.questions_answered,
                    RANK() OVER (ORDER BY cp.score DESC) AS rank
             FROM competition_participants cp
             JOIN users u ON cp.student_id = u.id
             WHERE cp.room_id = $1 AND cp.role = 'player'
             ORDER BY cp.score DESC`,
            [revealRoomResult.rows[0].id]
          );
          revealScores = scoresResult.rows;
        }

        broadcastToCompetitionRoom(roomCode, {
          type: 'competition-answer-reveal',
          questionIndex,
          question_text: q.question,
          options: q.options,
          correct_index: q.correct_answer,
          explanation: q.justification || '',
          scores: revealScores
        });

        const nextHandle = setTimeout(() => {
          revealNextCompetitionQuestion(roomCode).catch(err =>
            logger.error('revealNextCompetitionQuestion error', { error: err.message })
          );
        }, 3000);
        const s2 = competitionRoomState.get(roomCode);
        if (s2) s2.timerHandles.push(nextHandle);
      } catch (err) {
        logger.error('Error in competition reveal timeout', { error: err.message });
      }
    }, state.timePerQuestion * 1000);

    state.timerHandles.push(revealHandle);
  }

  async function endCompetition(roomCode) {
    const state = competitionRoomState.get(roomCode);
    if (state) {
      for (const handle of state.timerHandles) clearTimeout(handle);
      state.timerHandles = [];
    }

    await pool.query(
      `UPDATE competition_rooms SET status = 'finished', ended_at = NOW() WHERE room_code = $1`,
      [roomCode]
    );

    const leaderboardResult = await pool.query(
      `SELECT cp.student_id, u.full_name, cp.score, cp.correct_count, cp.questions_answered,
       CASE WHEN cp.questions_answered > 0
            THEN ROUND((cp.correct_count::DECIMAL / cp.questions_answered) * 100, 1)
            ELSE 0
       END AS accuracy,
       RANK() OVER (ORDER BY cp.score DESC) AS rank
       FROM competition_participants cp
       JOIN users u ON cp.student_id = u.id
       WHERE cp.room_id = (SELECT id FROM competition_rooms WHERE room_code = $1)
         AND cp.role = 'player'
       ORDER BY cp.score DESC`,
      [roomCode]
    );

    broadcastToCompetitionRoom(roomCode, {
      type: 'competition-finished',
      leaderboard: leaderboardResult.rows.map(r => ({ ...r, display_name: r.full_name }))
    });

    competitionRoomState.delete(roomCode);
    logger.info('Competition ended', { roomCode });

    setTimeout(() => {
      competitionConnections.delete(roomCode);
    }, 60 * 1000);
  }

  // ── WebSocket connection handler ──────────────────────────────────────────
  const jwt = require('jsonwebtoken');

  wss.on('connection', (ws, req) => {
    try {
      const urlParams = new URL(req.url, 'http://localhost').searchParams;
      const token = urlParams.get('token');

      if (!token) {
        ws.close(4001, 'Unauthorized: No token provided');
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      ws.userId = decoded.userId;
      ws.tokenExp = decoded.exp;
      ws.userRole = decoded.role;
    } catch (err) {
      ws.close(4001, 'Unauthorized: Invalid token');
      return;
    }

    logger.info('New WebSocket connection established', { userId: ws.userId, role: ws.userRole });

    ws.on('message', async (message) => {
      try {
        if (ws.tokenExp && Math.floor(Date.now() / 1000) > ws.tokenExp) {
          ws.close(4001, 'Unauthorized: Token expired');
          return;
        }

        const data = JSON.parse(message);

        switch (data.type) {
          case 'join-session':
            await handleJoinSession(ws, data);
            break;
          case 'join-dashboard': {
            const dashKey = String(ws.userId);
            if (!dashboardConnections.has(dashKey)) dashboardConnections.set(dashKey, new Set());
            dashboardConnections.get(dashKey).add(ws);
            ws.isDashboard = true;
            ws.send(JSON.stringify({ type: 'dashboard-joined' }));
            break;
          }
          case 'poll-response':
            // Handled server-side via REST POST /api/polls/:id/respond
            break;
          case 'activate-poll':
            await handleActivatePoll(data);
            break;
          case 'heartbeat':
            handleHeartbeat(data);
            break;
          case 'mark-attendance':
            await handleMarkAttendance(ws, data);
            break;
          case 'close-attendance':
            await handleCloseAttendance(ws, data);
            break;
          case 'open-attendance':
            await handleOpenAttendance(ws, data);
            break;
          case 'student-stuck': {
            if (ws.sessionId && ws.studentId) {
              const sid = String(ws.sessionId).toUpperCase();
              const redisKey = `stuck:${sid}`;
              let count;
              if (redis) {
                await redis.sadd(redisKey, String(ws.studentId)).catch(() => {});
                await redis.expire(redisKey, 86400).catch(() => {});
                count = await redis.scard(redisKey).catch(() => null);
              }
              if (count == null) {
                if (!global.stuckCounts) global.stuckCounts = new Map();
                if (!global.stuckCounts.has(sid)) global.stuckCounts.set(sid, new Set());
                global.stuckCounts.get(sid).add(ws.studentId);
                count = global.stuckCounts.get(sid).size;
              }
              broadcastToSession(sid, { type: 'stuck-update', count });
              ws.send(JSON.stringify({ type: 'stuck-ack' }));
            }
            break;
          }
          case 'stuck-reset': {
            if (ws.userRole === 'teacher' && ws.sessionId) {
              const sid = String(ws.sessionId).toUpperCase();
              if (redis) {
                await redis.del(`stuck:${sid}`).catch(() => {});
              }
              if (global.stuckCounts) global.stuckCounts.delete(sid);
              broadcastToSession(sid, { type: 'stuck-update', count: 0 });
            }
            break;
          }
          case 'toggle-leaderboard':
            if (ws.userRole === 'teacher') {
              const normalizedSid = (data.sessionId ? String(data.sessionId) : String(ws.sessionId || '')).toUpperCase();
              if (normalizedSid) {
                const visible = !!data.visible;
                pool.query(
                  'UPDATE sessions SET leaderboard_visible = $1 WHERE session_id = $2',
                  [visible, normalizedSid]
                ).catch(err => logger.error('toggle-leaderboard DB error', { error: err.message }));
                broadcastToSession(normalizedSid, {
                  type: 'leaderboard-visibility',
                  visible
                });
                // When making visible, also push current leaderboard data so the
                // student overlay has something to render immediately
                if (visible) {
                  const { getSessionLeaderboard } = require('../routes/gamification');
                  pool.query('SELECT id FROM sessions WHERE session_id = $1', [normalizedSid])
                    .then(async sessionRes => {
                      if (sessionRes.rows.length > 0) {
                        const leaderboard = await getSessionLeaderboard(sessionRes.rows[0].id, 50);
                        broadcastToSession(normalizedSid, { type: 'leaderboard-update', leaderboard });
                      }
                    })
                    .catch(err => logger.error('toggle-leaderboard fetch error', { error: err.message }));
                }
              }
            }
            break;
          case 'join-competition':
            handleJoinCompetition(ws, data)
              .catch(err => logger.error('join-competition error', { error: err.message }));
            break;
          case 'start-competition':
            handleStartCompetition(ws, data)
              .catch(err => logger.error('start-competition error', { error: err.message }));
            break;
          case 'competition-answer':
            handleCompetitionAnswer(ws, data)
              .catch(err => logger.error('competition-answer error', { error: err.message }));
            break;
          case 'leave-competition':
            handleLeaveCompetition(ws, data);
            break;
          default:
            logger.debug('Unknown WebSocket message type', { type: data.type });
            break;
        }
      } catch (error) {
        logger.error('Error parsing WebSocket message', { error: error.message });
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket client error', { error: error.message, userId: ws.userId });
    });

    ws.on('close', () => {
      logger.info('WebSocket connection closed', { userId: ws.userId });

      if (ws.studentId && ws.sessionId) {
        pool.query(
          `UPDATE session_participants
           SET connection_status = 'offline', is_active = false, last_activity = CURRENT_TIMESTAMP
           WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
           AND student_id = $2`,
          [ws.sessionId, ws.studentId]
        ).catch(err => logger.error('Error updating disconnect status', { error: err.message }));
        pendingHeartbeats.delete(`${ws.sessionId}:${ws.studentId}`);
      }

      if (ws.isDashboard && ws.userId) {
        const dashKey = String(ws.userId);
        const conns = dashboardConnections.get(dashKey);
        if (conns) {
          conns.delete(ws);
          if (conns.size === 0) dashboardConnections.delete(dashKey);
        }
      }

      // Clean up competition connection
      if (ws.competitionRoomCode) {
        const roomMap = competitionConnections.get(ws.competitionRoomCode);
        if (roomMap) roomMap.delete(String(ws.userId));
      }

      for (const [sessionId, connections] of sessionConnections.entries()) {
        const index = connections.indexOf(ws);
        if (index !== -1) {
          connections.splice(index, 1);
          if (connections.length === 0) {
            sessionConnections.delete(sessionId);
          }
          break;
        }
      }
    });
  });

  // ── Inactive participant cleanup (every 5 minutes) ───────────────────────
  setInterval(async () => {
    try {
      const result = await pool.query(`
        UPDATE session_participants
        SET is_active = false, connection_status = 'offline'
        WHERE last_activity < NOW() - INTERVAL '5 minutes'
          AND is_active = true AND connection_status = 'online'
        RETURNING session_id
      `);

      if (result.rows.length > 0) {
        logger.info('Cleaned up inactive participants', { count: result.rows.length });
        const sessionIds = [...new Set(result.rows.map(row => row.session_id))];

        for (const sessionId of sessionIds) {
          const countResult = await pool.query(`
            SELECT s.session_id, COUNT(*) as count
            FROM session_participants sp
            JOIN sessions s ON sp.session_id = s.id
            WHERE s.id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
            GROUP BY s.session_id
          `, [sessionId]);

          if (countResult.rows.length > 0) {
            broadcastToSession(countResult.rows[0].session_id.toUpperCase(), {
              type: 'participant-count-updated',
              count: parseInt(countResult.rows[0].count)
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error during automatic cleanup', { error: error.message });
    }
  }, 5 * 60 * 1000);

  // ── Startup restore functions ─────────────────────────────────────────────

  async function restoreActivePolls() {
    try {
      const result = await pool.query(`
        SELECT p.*, s.session_id as session_code
        FROM polls p
        JOIN sessions s ON p.session_id = s.id
        WHERE p.is_active = true AND p.ends_at IS NOT NULL AND p.ends_at > NOW()
      `);

      if (result.rows.length === 0) return;

      logger.info('Restoring active polls after restart', { count: result.rows.length });

      for (const poll of result.rows) {
        const normalizedSessionId = poll.session_code.toUpperCase();
        const pollEndTime = new Date(poll.ends_at).getTime();
        const remainingMs = pollEndTime - Date.now();

        if (remainingMs > 0) {
          global.activePollEndTimes.set(normalizedSessionId, { pollId: poll.id, pollEndTime, poll });
          const timer = setTimeout(async () => {
            await triggerAnswerRevealFromTimer(normalizedSessionId, poll.id);
            global.pollTimers.delete(normalizedSessionId);
            global.activePollEndTimes.delete(normalizedSessionId);
          }, remainingMs);
          global.pollTimers.set(normalizedSessionId, timer);
          logger.info('Restored poll timer', { pollId: poll.id, remainingMs });
        }
      }
    } catch (error) {
      logger.error('Error restoring active polls', { error: error.message });
    }
  }

  async function restoreAttendanceWindows() {
    try {
      const result = await pool.query(`
        SELECT saw.id as window_id, s.session_id as session_code,
               saw.opened_at, saw.duration_seconds
        FROM session_attendance_windows saw
        JOIN sessions s ON s.id = saw.session_id
        WHERE saw.is_active = TRUE
      `);

      let restored = 0;
      for (const row of result.rows) {
        const closesAt = new Date(row.opened_at).getTime() + row.duration_seconds * 1000;
        if (closesAt <= Date.now()) {
          await pool.query(
            'UPDATE session_attendance_windows SET is_active = FALSE, closed_at = CURRENT_TIMESTAMP WHERE id = $1',
            [row.window_id]
          );
          continue;
        }
        const normalizedCode = row.session_code.toUpperCase();
        attendanceWindows.set(normalizedCode, {
          windowId: row.window_id,
          closesAt,
          markedStudentIds: new Set()
        });
        const msRemaining = closesAt - Date.now();
        const sessionResult = await pool.query('SELECT id FROM sessions WHERE session_id = $1', [normalizedCode]);
        if (sessionResult.rows.length > 0) {
          const numericId = sessionResult.rows[0].id;
          setTimeout(async () => {
            const current = attendanceWindows.get(normalizedCode);
            if (current && current.windowId === row.window_id) {
              await closeAttendanceWindow(normalizedCode, numericId);
            }
          }, msRemaining);
        }
        restored++;
      }
      if (restored > 0) logger.info(`Restored ${restored} active attendance window(s) from DB`);
    } catch (err) {
      logger.warn('Failed to restore attendance windows (non-fatal)', { error: err.message });
    }
  }

  return { restoreActivePolls, restoreAttendanceWindows };
}

module.exports = { initWebSocket };

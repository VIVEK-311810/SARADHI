require('dotenv').config();

// Crash immediately if critical env vars are missing
if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set');
if (!process.env.SESSION_SECRET) throw new Error('FATAL: SESSION_SECRET environment variable is not set');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const { passport } = require('./config/oauth-dynamic');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const logger = require('./logger');
const { apiLimiter, aiLimiter, aiStudentLimiter, authLimiter } = require('./middleware/rateLimiter');
const { authenticate } = require('./middleware/auth');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Make WebSocket server globally available for other modules
global.wss = wss;

// Store active connections by session
const sessionConnections = new Map();

// Competition room connections: roomCode → Map<studentId (string), WebSocket>
const competitionConnections = new Map();

// In-memory room state: roomCode → { status, currentQuestionIndex, questionStartTime, allQuestions, timePerQuestion, totalQuestions, timerHandles }
const competitionRoomState = new Map();

// Throttle heartbeat DB writes — track last update per student (key: sessionId:studentId)
const heartbeatLastUpdate = new Map();

// Track in-progress reveals to prevent race condition double-broadcasts
const revealInProgress = new Set();

// Track active attendance windows: normalizedSessionId → { windowId, closesAt, markedStudentIds: Set }
const attendanceWindows = new Map();

// Dashboard connections: studentId (number) → Set<WebSocket>
// Allows pushing class-started/class-ended to students on the dashboard page
const dashboardConnections = new Map();

// WebSocket connection handling — authenticate via token query param
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

  ws.on('message', (message) => {
    try {
      // Reject messages from connections whose JWT has since expired
      if (ws.tokenExp && Math.floor(Date.now() / 1000) > ws.tokenExp) {
        ws.close(4001, 'Unauthorized: Token expired');
        return;
      }

      const data = JSON.parse(message);

      switch (data.type) {
        case 'join-session':
          handleJoinSession(ws, data);
          break;
        case 'poll-response':
          handlePollResponse(ws, data);
          break;
        case 'activate-poll':
          if (ws.userRole !== 'teacher') {
            ws.send(JSON.stringify({ type: 'error', message: 'Only teachers can activate polls' }));
            break;
          }
          handleActivatePoll(data);
          break;
        case 'heartbeat':
          // Inject authenticated user info to prevent IDOR via WebSocket message
          handleHeartbeat({ ...data, studentId: ws.userId, sessionId: ws.sessionId || data.sessionId });
          break;
        case 'join-dashboard':
          if (ws.userId) {
            const dashKey = String(ws.userId);
            if (!dashboardConnections.has(dashKey)) {
              dashboardConnections.set(dashKey, new Set());
            }
            dashboardConnections.get(dashKey).add(ws);
            ws.isDashboard = true;
            logger.info('Student joined dashboard WS', { userId: dashKey, totalDashboard: dashboardConnections.size });
          }
          break;
        case 'open-attendance':
          handleOpenAttendance(ws, data);
          break;
        case 'mark-attendance':
          handleMarkAttendance(ws, data);
          break;
        case 'close-attendance':
          handleCloseAttendance(ws, data);
          break;
        case 'student-stuck': {
          // Student signals they're confused — track count per session, notify teacher
          if (ws.sessionId && ws.studentId) {
            const sid = String(ws.sessionId).toUpperCase();
            if (!global.stuckCounts) global.stuckCounts = new Map();
            if (!global.stuckCounts.has(sid)) global.stuckCounts.set(sid, new Set());
            global.stuckCounts.get(sid).add(ws.studentId);
            const count = global.stuckCounts.get(sid).size;
            broadcastToSession(sid, { type: 'stuck-update', count });
            // Acknowledge back to the student
            ws.send(JSON.stringify({ type: 'stuck-ack' }));
          }
          break;
        }
        case 'stuck-reset': {
          // Teacher resets stuck count (e.g. after addressing)
          if (ws.userRole === 'teacher' && ws.sessionId) {
            const sid = String(ws.sessionId).toUpperCase();
            if (global.stuckCounts) global.stuckCounts.delete(sid);
            broadcastToSession(sid, { type: 'stuck-update', count: 0 });
          }
          break;
        }
        case 'toggle-leaderboard':
          if (ws.userRole === 'teacher' && data.sessionId) {
            const normalizedSid = String(data.sessionId).toUpperCase();
            const visible = !!data.visible;
            pool.query(
              'UPDATE sessions SET leaderboard_visible = $1 WHERE session_id = $2',
              [visible, normalizedSid]
            ).catch(err => logger.error('toggle-leaderboard DB error', { error: err.message }));
            broadcastToSession(normalizedSid, {
              type: 'leaderboard-visibility',
              visible
            });
          }
          break;
        case 'join-competition':
          (async () => { await handleJoinCompetition(ws, data); })()
            .catch(err => logger.error('join-competition error', { error: err.message }));
          break;
        case 'start-competition':
          (async () => { await handleStartCompetition(ws, data); })()
            .catch(err => logger.error('start-competition error', { error: err.message }));
          break;
        case 'competition-answer':
          (async () => { await handleCompetitionAnswer(ws, data); })()
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

    // Mark student offline in DB on disconnect
    if (ws.studentId && ws.sessionId) {
      pool.query(
        `UPDATE session_participants
         SET connection_status = 'offline', is_active = false, last_activity = CURRENT_TIMESTAMP
         WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
         AND student_id = $2`,
        [ws.sessionId, ws.studentId]
      ).catch(err => logger.error('Error updating disconnect status', { error: err.message }));
      // Clean up heartbeat tracking for this student
      heartbeatLastUpdate.delete(`${ws.sessionId}:${ws.studentId}`);
    }

    // Clean up competition connection
    if (ws.competitionRoomCode) {
      const roomMap = competitionConnections.get(ws.competitionRoomCode);
      if (roomMap) roomMap.delete(String(ws.userId));
    }

    // Clean up dashboard connection
    if (ws.isDashboard && ws.userId) {
      const dashKey = String(ws.userId);
      const conns = dashboardConnections.get(dashKey);
      if (conns) {
        conns.delete(ws);
        if (conns.size === 0) dashboardConnections.delete(dashKey);
      }
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

async function handleJoinSession(ws, data) {
  const { sessionId } = data;
  const studentId = ws.userId; // Always use JWT-authenticated user ID — prevents IDOR
  const normalizedSessionId = sessionId.toUpperCase();

  if (!sessionConnections.has(normalizedSessionId)) {
    sessionConnections.set(normalizedSessionId, []);
  }

  sessionConnections.get(normalizedSessionId).push(ws);
  ws.sessionId = normalizedSessionId;
  ws.studentId = studentId;

  // Mark student as active in session_participants (handles reconnects after WS close)
  // Only for students — teachers must not appear in the participants list
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

  broadcastToSession(normalizedSessionId, {
    type: 'participant-count-updated',
    count: sessionConnections.get(normalizedSessionId).length
  });

  // Send active poll to late joiners
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

  // Handle late attendance: if attendance was taken but window is now closed,
  // auto-flag this student as 'late' (only if they were previously marked 'absent')
  try {
    const activeWindow = attendanceWindows.get(normalizedSessionId);
    if (!activeWindow) {
      // No active window — check if attendance was ever taken for this session
      const attendanceCheck = await pool.query(
        `SELECT COUNT(*) as cnt FROM session_participants
         WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
         AND attendance_status IS NOT NULL`,
        [normalizedSessionId]
      );
      if (parseInt(attendanceCheck.rows[0].cnt) > 0) {
        // Attendance was taken — auto-flag as late (only from 'absent', not from 'present')
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

function handlePollResponse(ws, data) {
  logger.debug('Poll response received via WebSocket', { pollId: data.pollId });
}

// Store active poll timers (globally accessible)
global.pollTimers = global.pollTimers || new Map();
global.activePollEndTimes = global.activePollEndTimes || new Map();

// Utility to clear a poll timer for a session (globally accessible)
global.clearPollTimer = function(sessionId) {
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

async function handleActivatePoll(data) {
  const { sessionId, poll } = data;
  const normalizedSessionId = sessionId.toUpperCase();

  const serverTime = Date.now();
  const timeLimitMs = (poll.time_limit || 60) * 1000;
  const pollEndTime = serverTime + timeLimitMs;

  // Persist ends_at to DB so polls survive server restarts
  pool.query('UPDATE polls SET ends_at = $1 WHERE id = $2', [new Date(pollEndTime), poll.id])
    .catch(err => logger.error('Failed to persist poll ends_at', { error: err.message }));

  global.activePollEndTimes.set(normalizedSessionId, {
    pollId: poll.id,
    pollEndTime,
    poll
  });

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
  }, timeLimitMs);

  global.pollTimers.set(normalizedSessionId, timer);
  logger.info('Poll activated', { pollId: poll.id, sessionId: normalizedSessionId, endsAt: new Date(pollEndTime).toISOString() });
}

async function triggerAnswerRevealFromTimer(sessionId, pollId) {
  try {
    const normalizedSessionId = sessionId.toUpperCase();
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

    // Broadcast updated session leaderboard after poll closes
    try {
      const { getSessionLeaderboard } = require('./routes/gamification');
      const sessionDbResult = await pool.query('SELECT id FROM sessions WHERE session_id = $1', [normalizedSessionId]);
      if (sessionDbResult.rows.length > 0) {
        const dbSessionId = sessionDbResult.rows[0].id;
        const leaderboard = await getSessionLeaderboard(dbSessionId, 50);
        broadcastToSession(normalizedSessionId, {
          type: 'leaderboard-update',
          leaderboard
        });
      }
    } catch (lbErr) {
      logger.warn('Failed to broadcast leaderboard update', { error: lbErr.message });
    }
  } catch (error) {
    logger.error('Error triggering timer-based answer reveal', { error: error.message, pollId, sessionId });
  }
}

async function handleHeartbeat(data) {
  const key = `${data.sessionId}:${data.studentId}`;
  const now = Date.now();
  if (now - (heartbeatLastUpdate.get(key) || 0) < 30000) return; // Throttle: max 1 DB write per 30s
  heartbeatLastUpdate.set(key, now);
  try {
    await pool.query(
      `UPDATE session_participants
       SET last_activity = CURRENT_TIMESTAMP
       WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
       AND student_id = $2`,
      [data.sessionId, data.studentId]
    );
  } catch (error) {
    logger.error('Error updating heartbeat', { error: error.message });
  }
}

function broadcastToSession(sessionId, message) {
  const connections = sessionConnections.get(sessionId);
  if (connections && connections.length > 0) {
    const payload = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

// Push a message to all students enrolled in a session who are on the dashboard page
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
global.broadcastToDashboardsForSession = broadcastToDashboardsForSession;

global.broadcastToSession = broadcastToSession;
global.sessionConnections = sessionConnections;

/**
 * Broadcast poll-related messages only to attendance-eligible students.
 * If attendance was never taken → falls back to broadcastToSession (backward compat).
 * If attendance was taken → sends only to 'present' and 'late' students + teachers.
 * On any error → falls back to broadcastToSession (never silently block polls).
 */
async function broadcastPollToSession(sessionId, message) {
  const connections = sessionConnections.get(sessionId);
  if (!connections || connections.length === 0) return;

  try {
    // Check if attendance was ever taken for this session
    const attendanceCheck = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE sp.attendance_status IS NOT NULL) as has_attendance
       FROM session_participants sp
       JOIN sessions s ON sp.session_id = s.id
       WHERE s.session_id = $1`,
      [sessionId]
    );

    const stats = attendanceCheck.rows[0];
    const attendanceTaken = parseInt(stats.has_attendance) > 0;

    if (!attendanceTaken) {
      // Backward compat: attendance never taken → broadcast to all
      broadcastToSession(sessionId, message);
      return;
    }

    // Attendance was taken — fetch eligible student IDs
    const eligibleResult = await pool.query(
      `SELECT sp.student_id
       FROM session_participants sp
       JOIN sessions s ON sp.session_id = s.id
       WHERE s.session_id = $1
       AND sp.attendance_status IN ('present', 'late')`,
      [sessionId]
    );
    const eligibleIds = new Set(eligibleResult.rows.map(r => String(r.student_id)));

    const payload = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Teachers always receive poll events for their own dashboard
      const isTeacher = ws.userRole === 'teacher';
      const isEligible = eligibleIds.has(String(ws.userId));
      if (isTeacher || isEligible) {
        ws.send(payload);
      }
    });
  } catch (error) {
    logger.error('Error in broadcastPollToSession, falling back to full broadcast', { error: error.message });
    broadcastToSession(sessionId, message);
  }
}

global.broadcastPollToSession = broadcastPollToSession;

// ─── Competition WebSocket Helpers ────────────────────────────────────────────

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

  // Fetch current participant list to broadcast
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

  // Fetch teacher polls with correct_answer — respect teacher_question_count limit
  let pollsResult;
  if (room.teacher_question_count > 0) {
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

  // Fetch AI-generated student questions
  const studentQResult = await pool.query(
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

  // Store in-memory state
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

  await revealNextQuestion(roomCode);
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

  // Get room id
  const roomResult = await pool.query(
    'SELECT id FROM competition_rooms WHERE room_code = $1',
    [roomCode]
  );
  if (roomResult.rows.length === 0) return;
  const roomId = roomResult.rows[0].id;

  // Atomic: INSERT answer + UPDATE score only when insert succeeds (no double-counting)
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
      roomId,           // $1 room_id
      ws.userId,        // $2 student_id
      q.id || null,     // $3 poll_id
      questionIndex,    // $4 question_index
      answerIndex,      // $5 answer_index
      isCorrect,        // $6 is_correct
      responseTimeMs,   // $7 response_time_ms
      pointsEarned,     // $8 points_earned  (also reused in UPDATE SET score)
      isCorrect ? 1 : 0 // $9 correct_count delta
    ]
  );

  // Count how many players answered this question
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM competition_answers
     WHERE room_id = $1 AND question_index = $2`,
    [roomId, questionIndex]
  );
  const playerCount = await pool.query(
    `SELECT COUNT(*) FROM competition_participants WHERE room_id = $1 AND role = 'player'`,
    [roomId]
  );

  // Notify how many have answered (does not reveal scores yet — scores show after timer)
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

async function revealNextQuestion(roomCode) {
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

  // Broadcast question — do NOT include correct_answer
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

  // Reveal answers after time is up — include scores here (not before)
  const revealHandle = setTimeout(async () => {
    try {
      // Fetch current scores to reveal alongside the answer
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
      // Advance to next question after 3-second review window
      const nextHandle = setTimeout(() => {
        revealNextQuestion(roomCode).catch(err =>
          logger.error('revealNextQuestion error', { error: err.message })
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

  // Clean up connections after 60s to allow result viewing
  setTimeout(() => {
    competitionConnections.delete(roomCode);
  }, 60 * 1000);
}

// One-time stale room cleanup on startup
async function cleanupStaleCompetitions() {
  try {
    const result = await pool.query(
      `UPDATE competition_rooms
       SET status = 'finished', ended_at = NOW()
       WHERE status IN ('waiting', 'active')
         AND created_at < NOW() - INTERVAL '24 hours'
       RETURNING room_code`
    );
    if (result.rows.length > 0) {
      logger.info('Cleaned up stale competition rooms', { count: result.rows.length });
    }
  } catch (err) {
    logger.warn('Failed to cleanup stale competitions (non-fatal)', { error: err.message });
  }
}

// ─── Attendance WebSocket Handlers ─────────────────────────────────────────

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

    // Close any existing open window first
    await pool.query(
      'UPDATE session_attendance_windows SET is_active = FALSE, closed_at = CURRENT_TIMESTAMP WHERE session_id = $1 AND is_active = TRUE',
      [numericSessionId]
    );

    // Create new window
    const windowResult = await pool.query(
      'INSERT INTO session_attendance_windows (session_id, duration_seconds, opened_by, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id',
      [numericSessionId, duration, ws.userId]
    );
    const windowId = windowResult.rows[0].id;
    const closesAt = Date.now() + duration * 1000;

    // Store in memory for fast mark-attendance lookups
    attendanceWindows.set(normalizedSessionId, {
      windowId,
      closesAt,
      markedStudentIds: new Set()
    });

    // Mark all current participants as 'absent' by default
    await pool.query(
      `UPDATE session_participants
       SET attendance_status = 'absent', attendance_marked_at = NULL
       WHERE session_id = $1`,
      [numericSessionId]
    );

    // Notify all connected clients
    broadcastToSession(normalizedSessionId, {
      type: 'attendance-opened',
      sessionId: normalizedSessionId,
      windowId,
      durationSeconds: duration,
      closesAt,
      server_time: Date.now()
    });

    logger.info('Attendance window opened', { sessionId: normalizedSessionId, windowId, duration });

    // Auto-close after duration
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
  const userId = ws.userId; // Always use JWT-authenticated user ID

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

    // Notify teacher of updated counts
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

// Trust Render's reverse proxy so express-rate-limit reads the real client IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS — always restrict to an explicit allowlist; never use wildcard
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://sas-edu-ai-f.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no Origin header) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false); // reject with proper CORS 403, not a 500 error
  },
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Session middleware for OAuth2
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Apply rate limiters
app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);
app.use('/api/ai-search', aiLimiter);
app.use('/api/ai-assistant', aiStudentLimiter);

// Import route modules
const authRouter = require('./routes/auth-dynamic');
const sessionsRouter = require('./routes/sessions');
const pollsRouter = require('./routes/polls');
const newResourcesRouter = require('./routes/resources');
const aiSearchRouter = require('./routes/ai-search');
const generatedMCQsRoutes = require('./routes/generated-mcqs');
const studentsRouter = require('./routes/students');
const transcriptionRouter = require('./routes/transcription');
const analyticsRouter = require('./routes/analytics');
const exportRouter = require('./routes/export');
const gamificationRouter = require('./routes/gamification');
const communityRouter = require('./routes/community');
const aiAssistantRouter = require('./routes/ai-assistant');
const knowledgeCardsRouter = require('./routes/knowledge-cards');
const competitionRouter = require('./routes/competition');

// Mount routes
app.use('/auth', authRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/polls', pollsRouter);
app.use('/api/resources', newResourcesRouter);
app.use('/api/ai-search', aiSearchRouter);
app.use('/api/students', studentsRouter);
app.use('/api', generatedMCQsRoutes);
app.use('/api/transcription', transcriptionRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/export', exportRouter);
app.use('/api/gamification', gamificationRouter);
app.use('/api/community', communityRouter);
app.use('/api/ai-assistant', aiAssistantRouter);
app.use('/api/knowledge-cards', knowledgeCardsRouter);
app.use('/api/competition', competitionRouter);

// Attendance REST endpoint — get attendance list and counts for a session
app.get('/api/sessions/:sessionId/attendance', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(`
      SELECT
        u.id, u.full_name, u.email,
        sp.attendance_status,
        sp.attendance_marked_at,
        sp.joined_at,
        sp.connection_status,
        sp.is_active
      FROM session_participants sp
      JOIN users u ON sp.student_id = u.id
      WHERE sp.session_id = (SELECT id FROM sessions WHERE session_id = $1)
      ORDER BY
        CASE sp.attendance_status
          WHEN 'present' THEN 1
          WHEN 'late'    THEN 2
          WHEN 'absent'  THEN 3
          ELSE 4
        END,
        sp.joined_at ASC
    `, [sessionId.toUpperCase()]);

    const counts = {
      present: result.rows.filter(r => r.attendance_status === 'present').length,
      late:    result.rows.filter(r => r.attendance_status === 'late').length,
      absent:  result.rows.filter(r => r.attendance_status === 'absent').length
    };

    res.json({ participants: result.rows, counts });
  } catch (error) {
    logger.error('Error fetching attendance', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Session participant management endpoints
app.post('/api/sessions/:sessionId/join', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { websocket_id } = req.body;
    // Always use the authenticated user's ID — prevents IDOR
    const student_id = req.user.id;

    const query = `
      INSERT INTO session_participants (session_id, student_id, connection_status, websocket_id, is_active)
      VALUES ((SELECT id FROM sessions WHERE session_id = $1), $2, 'online', $3, true)
      ON CONFLICT (session_id, student_id)
      DO UPDATE SET
        connection_status = 'online',
        joined_at = CURRENT_TIMESTAMP,
        left_at = NULL,
        is_active = true,
        websocket_id = $3,
        last_activity = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [sessionId, student_id, websocket_id]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE s.session_id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
    `, [sessionId]);

    broadcastToSession(sessionId.toUpperCase(), {
      type: 'participant-count-updated',
      count: parseInt(countResult.rows[0].count)
    });

    res.json({ success: true, participant: result.rows[0] });
  } catch (error) {
    logger.error('Error joining session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sessions/:sessionId/leave', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const student_id = req.user.id;

    await pool.query(`
      UPDATE session_participants
      SET connection_status = 'offline', left_at = CURRENT_TIMESTAMP,
          is_active = false, websocket_id = NULL, last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
      AND student_id = $2
    `, [sessionId, student_id]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE s.session_id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
    `, [sessionId]);

    broadcastToSession(sessionId.toUpperCase(), {
      type: 'participant-count-updated',
      count: parseInt(countResult.rows[0].count)
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error leaving session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sessions/:sessionId/rejoin', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const student_id = req.user.id;

    const result = await pool.query(`
      UPDATE session_participants
      SET connection_status = 'online', is_active = true, last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
      AND student_id = $2
      RETURNING *
    `, [sessionId, student_id]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM session_participants sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE s.session_id = $1 AND sp.is_active = true AND sp.connection_status = 'online'
    `, [sessionId]);

    broadcastToSession(sessionId.toUpperCase(), {
      type: 'participant-count-updated',
      count: parseInt(countResult.rows[0].count)
    });

    res.json({ success: true, participant: result.rows[0] });
  } catch (error) {
    logger.error('Error rejoining session', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sessions/:sessionId/update-connection', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const student_id = req.user.id;
    const { connection_status } = req.body;

    // Validate connection_status to prevent arbitrary DB values
    const allowedStatuses = ['online', 'offline', 'away'];
    if (!allowedStatuses.includes(connection_status)) {
      return res.status(400).json({ error: 'Invalid connection_status value' });
    }

    await pool.query(`
      UPDATE session_participants
      SET connection_status = $3, last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
      AND student_id = $2
    `, [sessionId, student_id, connection_status]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating connection status', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sessions/:sessionId/update-activity', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const student_id = req.user.id;

    await pool.query(`
      UPDATE session_participants
      SET last_activity = CURRENT_TIMESTAMP
      WHERE session_id = (SELECT id FROM sessions WHERE session_id = $1)
      AND student_id = $2
    `, [sessionId, student_id]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating last activity', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup inactive participants every 5 minutes
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

// Restore active polls on startup (polls survive server restarts)
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

// AI Tutor endpoint (connects to n8n workflow)
app.post('/api/tutor', authenticate, async (req, res) => {
  try {
    const { question, mode } = req.body;

    if (!question || !mode) {
      return res.status(400).json({ error: 'Question and mode are required' });
    }

    if (!process.env.N8N_WEBHOOK_URL) {
      return res.status(503).json({ error: 'AI tutor not configured' });
    }

    const fetch = require('node-fetch');
    const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, mode })
    });

    if (!n8nResponse.ok) {
      throw new Error(`n8n request failed with status ${n8nResponse.status}`);
    }

    const result = await n8nResponse.json();
    res.json(result);
  } catch (error) {
    logger.error('Error forwarding to n8n', { error: error.message });
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    dbStatus = 'down';
  }

  const health = {
    status: dbStatus === 'ok' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    database: dbStatus,
    websockets: {
      totalConnections: wss.clients.size,
      activeSessions: sessionConnections.size
    },
    activePolls: global.pollTimers ? global.pollTimers.size : 0
  };

  res.status(dbStatus === 'ok' ? 200 : 503).json(health);
});

// Global error handler — must set CORS headers before responding so browser
// doesn't treat the error response as a CORS failure (hiding the real error)
app.use((err, req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    process.env.FRONTEND_URL,
    'https://sas-edu-ai-f.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  const status = err.status || err.statusCode || 500;
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Auto-migrate: apply any missing schema changes so deploys don't need manual SQL runs
// Each statement runs independently so one failure never blocks the rest.
// users.id is VARCHAR in this schema, so all user FK columns must be VARCHAR.
async function autoMigrate() {
  // Acquire a single connection for all DDL — avoids hammering the pool on cold start
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    logger.warn('autoMigrate: DB not reachable on startup, skipping schema sync', { error: err.message });
    return;
  }

  const run = async (sql, label) => {
    try {
      await client.query(sql);
      logger.info(`Auto-migration OK: ${label}`);
    } catch (err) {
      logger.error(`Auto-migration FAILED (non-fatal): ${label}`, { error: err.message });
    }
  };

  // Migration 007 – live class control, attendance, community
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE`, 'sessions.is_live');
  await run(`ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20)`, 'sp.attendance_status');
  await run(`ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMP`, 'sp.attendance_marked_at');

  await run(`
    CREATE TABLE IF NOT EXISTS session_attendance_windows (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      duration_seconds INTEGER NOT NULL DEFAULT 60,
      opened_by VARCHAR NOT NULL REFERENCES users(id),
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `, 'session_attendance_windows');

  await run(`
    CREATE TABLE IF NOT EXISTS community_tickets (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      subject VARCHAR(100),
      author_id VARCHAR NOT NULL REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      upvote_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'community_tickets');

  await run(`
    CREATE TABLE IF NOT EXISTS community_replies (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
      author_id VARCHAR NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_solution BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'community_replies');

  await run(`
    CREATE TABLE IF NOT EXISTS community_upvotes (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ticket_id, user_id)
    )
  `, 'community_upvotes');

  // Migration 008 – AI Study Assistant
  await run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(10) NOT NULL,
      student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE
    )
  `, 'ai_conversations');

  await run(`CREATE INDEX IF NOT EXISTS idx_ai_conversations_student_session ON ai_conversations(student_id, session_id)`, 'idx_ai_conversations_student_session');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      message_type VARCHAR(30) DEFAULT 'text',
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'ai_messages');

  await run(`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at)`, 'idx_ai_messages_conversation');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_doubts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
      session_id VARCHAR(10) NOT NULL,
      student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doubt_text TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
      resolved_by VARCHAR REFERENCES users(id),
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'ai_doubts');

  await run(`CREATE INDEX IF NOT EXISTS idx_ai_doubts_session_status ON ai_doubts(session_id, status)`, 'idx_ai_doubts_session_status');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_study_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR(10) NOT NULL,
      total_queries INTEGER DEFAULT 0,
      topics_explored TEXT[],
      resources_referenced UUID[],
      last_query_at TIMESTAMP,
      study_duration_minutes INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, session_id)
    )
  `, 'ai_study_analytics');

  await run(`ALTER TABLE resource_chunks ADD COLUMN IF NOT EXISTS section_title VARCHAR(255)`, 'resource_chunks.section_title');

  // Migration 009 – Auto Notes Generation: session live timing + notes lifecycle
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMP`, 'sessions.live_started_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMP`, 'sessions.live_ended_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_status VARCHAR(20) DEFAULT 'none'`, 'sessions.notes_status');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_url TEXT`, 'sessions.notes_url');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_generated_at TIMESTAMP`, 'sessions.notes_generated_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_error TEXT`, 'sessions.notes_error');

  await run(`
    CREATE TABLE IF NOT EXISTS session_notes (
      id                      SERIAL PRIMARY KEY,
      session_id              INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      status                  VARCHAR(20) NOT NULL DEFAULT 'generating',
      notes_url               TEXT,
      storage_path            TEXT,
      transcript_length       INTEGER,
      resource_count          INTEGER,
      generation_started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      generation_completed_at TIMESTAMP,
      error_message           TEXT
    )
  `, 'session_notes');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id)`, 'idx_session_notes_session_id');

  // Migration 009b – Gamification Revamp: XP, session-scoped streaks, summaries
  await run(`
    CREATE TABLE IF NOT EXISTS student_xp (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      xp_amount INTEGER NOT NULL,
      xp_type VARCHAR(50) NOT NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_xp UNIQUE (student_id, session_id, xp_type)
    )
  `, 'student_xp');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_xp_student ON student_xp(student_id)`, 'idx_student_xp_student');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_xp_session ON student_xp(session_id)`, 'idx_student_xp_session');

  await run(`
    CREATE TABLE IF NOT EXISTS session_streaks (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      current_streak INTEGER DEFAULT 0,
      max_streak INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_streak UNIQUE (student_id, session_id)
    )
  `, 'session_streaks');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_streaks_student_session ON session_streaks(student_id, session_id)`, 'idx_session_streaks_student_session');

  await run(`
    CREATE TABLE IF NOT EXISTS session_summaries (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      rank INTEGER,
      total_participants INTEGER,
      accuracy DECIMAL(5,2),
      points_earned INTEGER DEFAULT 0,
      xp_gained INTEGER DEFAULT 0,
      badges_earned TEXT[] DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_summary UNIQUE (student_id, session_id)
    )
  `, 'session_summaries');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_summaries_student ON session_summaries(student_id)`, 'idx_session_summaries_student');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id)`, 'idx_session_summaries_session');

  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 1`, 'polls.difficulty');
  await run(`ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS badge_tier VARCHAR(10) DEFAULT 'bronze'`, 'student_badges.badge_tier');
  await run(`ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS badge_category VARCHAR(50)`, 'student_badges.badge_category');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS leaderboard_visible BOOLEAN DEFAULT false`, 'sessions.leaderboard_visible');
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_session_level_points
      ON student_points(student_id, session_id, point_type) WHERE poll_id IS NULL
  `, 'unique_session_level_points');

  // Migration 010 – Knowledge Cards: interactive Q&A card activity
  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_card_rounds (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      teacher_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'distributed', 'active', 'completed')),
      total_pairs INTEGER DEFAULT 0,
      topic VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'knowledge_card_rounds');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_rounds_session ON knowledge_card_rounds(session_id)`, 'idx_kc_rounds_session');

  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_card_pairs (
      id SERIAL PRIMARY KEY,
      round_id INTEGER REFERENCES knowledge_card_rounds(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revealed', 'completed', 'skipped')),
      question_holder_id VARCHAR(50),
      answer_holder_id VARCHAR(50),
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'knowledge_card_pairs');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_pairs_round ON knowledge_card_pairs(round_id)`, 'idx_kc_pairs_round');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_pairs_question_holder ON knowledge_card_pairs(question_holder_id)`, 'idx_kc_pairs_question_holder');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_pairs_answer_holder ON knowledge_card_pairs(answer_holder_id)`, 'idx_kc_pairs_answer_holder');

  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_card_votes (
      id SERIAL PRIMARY KEY,
      pair_id INTEGER REFERENCES knowledge_card_pairs(id) ON DELETE CASCADE,
      student_id VARCHAR(50) NOT NULL,
      vote VARCHAR(10) NOT NULL CHECK (vote IN ('up', 'down')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_kc_vote UNIQUE (pair_id, student_id)
    )
  `, 'knowledge_card_votes');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_votes_pair ON knowledge_card_votes(pair_id)`, 'idx_kc_votes_pair');

  // Migration 011 – Competition System
  await run(`
    CREATE TABLE IF NOT EXISTS competition_rooms (
      id SERIAL PRIMARY KEY,
      room_code VARCHAR(8) UNIQUE NOT NULL,
      session_id VARCHAR(20) REFERENCES sessions(session_id) ON DELETE CASCADE,
      created_by VARCHAR REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'waiting',
      current_question_index INTEGER DEFAULT -1,
      question_start_time BIGINT,
      time_per_question INTEGER DEFAULT 20,
      total_questions INTEGER DEFAULT 0,
      teacher_question_count INTEGER DEFAULT 0,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, 'competition_rooms');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_rooms_status ON competition_rooms(status)`, 'idx_competition_rooms_status');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_rooms_session ON competition_rooms(session_id)`, 'idx_competition_rooms_session');
  await run(`ALTER TABLE competition_rooms ADD COLUMN IF NOT EXISTS teacher_question_count INTEGER DEFAULT 0`, 'competition_rooms.teacher_question_count');

  await run(`
    CREATE TABLE IF NOT EXISTS competition_participants (
      id SERIAL PRIMARY KEY,
      room_id INTEGER REFERENCES competition_rooms(id) ON DELETE CASCADE,
      student_id VARCHAR REFERENCES users(id),
      role VARCHAR(10) DEFAULT 'player',
      score INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      questions_answered INTEGER DEFAULT 0,
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id, student_id)
    )
  `, 'competition_participants');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_participants_room ON competition_participants(room_id)`, 'idx_competition_participants_room');

  await run(`
    CREATE TABLE IF NOT EXISTS competition_answers (
      id SERIAL PRIMARY KEY,
      room_id INTEGER REFERENCES competition_rooms(id) ON DELETE CASCADE,
      student_id VARCHAR REFERENCES users(id),
      poll_id INTEGER,
      question_index INTEGER,
      answer_index INTEGER,
      is_correct BOOLEAN,
      response_time_ms INTEGER,
      points_earned INTEGER DEFAULT 0,
      answered_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id, student_id, question_index)
    )
  `, 'competition_answers');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_answers_room ON competition_answers(room_id)`, 'idx_competition_answers_room');

  await run(`
    CREATE TABLE IF NOT EXISTS student_questions (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(20) REFERENCES sessions(session_id) ON DELETE CASCADE,
      created_by VARCHAR REFERENCES users(id),
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      correct_answer INTEGER NOT NULL,
      justification TEXT,
      source VARCHAR(10) DEFAULT 'ai',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, 'student_questions');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_questions_session ON student_questions(session_id)`, 'idx_student_questions_session');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_questions_creator ON student_questions(created_by)`, 'idx_student_questions_creator');

  // Initialize cache service
  const cacheService = require('./services/cacheService');
  await cacheService.init().catch(err => logger.warn('Cache service init failed (non-fatal)', { error: err.message }));

  client.release();
}

// Start server
server.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`WebSocket server ready`);
  await autoMigrate();
  await restoreActivePolls();
  await cleanupStaleCompetitions();
});

// Graceful shutdown — notify WebSocket clients, drain pool
function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  // Notify all connected clients
  wss.clients.forEach(ws => {
    try {
      ws.send(JSON.stringify({ type: 'server-restarting', message: 'Server restarting. Please reconnect in a few seconds.' }));
    } catch (e) {}
  });

  // Give clients 2 seconds to receive the message
  setTimeout(() => {
    server.close(() => {
      logger.info('HTTP server closed');
      pool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => process.exit(1), 25000);
  }, 2000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Log unhandled errors before Node.js 15+ crashes the process
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection — this crashed the process', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — process will exit', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = { app, server, wss };

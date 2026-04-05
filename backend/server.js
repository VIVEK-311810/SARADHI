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
const pool = require('./db');
const logger = require('./logger');
const { apiLimiter, aiLimiter, aiStudentLimiter, authLimiter, salesAgentLimiter } = require('./middleware/rateLimiter');
const { authenticate } = require('./middleware/auth');
const compression = require('compression');
const { redis, redisPub, redisSub } = require('./redis');

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Make WebSocket server globally available for other modules
global.wss = wss;
// WebSocket handler: extracted to ws/sessionSocket.js
const { initWebSocket } = require('./ws/sessionSocket');
const { restoreActivePolls, restoreAttendanceWindows } = initWebSocket(wss, { pool, redis, redisPub, redisSub, logger });

app.set('trust proxy', 1);

// Security middleware — explicit CSP prevents inline script execution even if XSS payload reaches the browser
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],   // Tailwind utility classes require inline styles
      imgSrc: ["'self'", "data:", "blob:", "*.supabase.co"],
      connectSrc: ["'self'", "*.supabase.co", "*.pinecone.io", "router.huggingface.co", "api.mistral.ai", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    }
  }
}));

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

// Cache-Control helper — use on read-heavy endpoints that change infrequently.
// `private` = browser cache only (not shared CDN cache — data is user-specific).
// `stale-while-revalidate` = serve stale copy instantly while fetching fresh in background.
function cachePrivate(maxAgeSeconds, swrSeconds = maxAgeSeconds * 2) {
  return (_req, res, next) => {
    res.set('Cache-Control', `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${swrSeconds}`);
    next();
  };
}
app.set('etag', 'strong'); // Express generates ETags by default; ensure strong ETags for If-None-Match 304s

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
const salesAgentRouter = require('./routes/sales-agent');
const healthRouter = require('./routes/health');
const { startWorkers, stopWorkers } = require('./workers/aiWorker');
const { setupBullBoard } = require('./workers/setup');

// Mount routes
app.use('/auth', authRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/polls', pollsRouter);
// Resources list changes on upload/delete — 15s cache covers rapid re-fetches
app.use('/api/resources', cachePrivate(15), newResourcesRouter);
app.use('/api/ai-search', aiSearchRouter);
// Student dashboard summary — changes after polls close; 30s cache
app.use('/api/students', cachePrivate(30), studentsRouter);
app.use('/api', generatedMCQsRoutes);
app.use('/api/transcription', transcriptionRouter);
// Analytics rarely change mid-session; 60s cache
app.use('/api/analytics', cachePrivate(60), analyticsRouter);
app.use('/api/export', exportRouter);
// Gamification stats change after polls — 30s cache
app.use('/api/gamification', cachePrivate(30), gamificationRouter);
app.use('/api/community', communityRouter);
app.use('/api/ai-assistant', aiAssistantRouter);
app.use('/api/knowledge-cards', knowledgeCardsRouter);
// Public sales agent — no auth required, own rate limiter
app.use('/api/sales-agent', salesAgentLimiter, salesAgentRouter);
app.use('/health', healthRouter);
setupBullBoard(app);

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

// Auto-migrate: extracted to migrations/autoMigrate.js
const { runAutoMigrations } = require('./migrations/autoMigrate');
const autoMigrate = runAutoMigrations;

// Start server
server.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`WebSocket server ready`);
  await autoMigrate();
  await restoreActivePolls();
  await restoreAttendanceWindows();
  startWorkers();
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
    stopWorkers().catch(() => {}).finally(() => {
      server.close(() => {
        logger.info('HTTP server closed');
        pool.end(() => {
          logger.info('Database pool closed');
          process.exit(0);
        });
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

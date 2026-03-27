# SAS Edu AI — Architectural Redesign Plan for Scale

> **Date:** 2026-03-26
> **Scope:** Full architectural redesign of both `sas_b/` (Express backend) and `SAS-EDU-AI_F/` (React frontend)
> **Goal:** Support 1,000+ concurrent students across multiple live classrooms without degradation

---

## Table of Contents

1. [Current Architecture — The Problem](#1-current-architecture--the-problem)
2. [Target Architecture — The Vision](#2-target-architecture--the-vision)
3. [Change 1 — Database Layer](#3-change-1--database-layer)
4. [Change 2 — Redis as the Shared Nervous System](#4-change-2--redis-as-the-shared-nervous-system)
5. [Change 3 — WebSocket Architecture](#5-change-3--websocket-architecture)
6. [Change 4 — AI & RAG Pipeline](#6-change-4--ai--rag-pipeline)
7. [Change 5 — File Upload Pipeline](#7-change-5--file-upload-pipeline)
8. [Change 6 — Authentication Layer](#8-change-6--authentication-layer)
9. [Change 7 — Frontend Architecture](#9-change-7--frontend-architecture)
10. [Change 8 — Observability & Resilience](#10-change-8--observability--resilience)
11. [Migration Roadmap](#11-migration-roadmap)
12. [Infrastructure Topology](#12-infrastructure-topology)

---

## 1. Current Architecture — The Problem

### What you have today

```
Browser ──HTTP──► Express.js (single process, Render free tier)
                    │
                    ├── In-Memory State (Maps/Sets)
                    │     ├── sessionConnections: Map<sessionId, WebSocket[]>
                    │     ├── dashboardConnections: Map<studentId, Set<WebSocket>>
                    │     ├── heartbeatLastUpdate: Map<key, timestamp>
                    │     ├── attendanceWindows: Map<sessionId, {...}>
                    │     ├── revealInProgress: Set<pollId>
                    │     └── global.pollTimers: Map<sessionId, timeoutId>
                    │
                    ├── PostgreSQL (Supabase, pool: 5)
                    │
                    ├── HuggingFace (embeddings, rate-limited, sequential)
                    ├── Mistral API (LLM, synchronous, blocking)
                    └── Pinecone (vector search)
```

### Why this breaks at scale

| Failure Mode | Trigger | Impact |
|---|---|---|
| DB pool exhaustion | >50 concurrent users | All requests timeout |
| Memory loss | Server restart or deploy | Live sessions destroyed, attendance gone |
| Cross-instance blindness | Second Node process started | Students and teacher on different instances can't communicate |
| Event loop saturation | 5+ teachers uploading 50MB docs | All requests stall for 2-3 minutes |
| LLM timeout cascade | 10+ students asking AI simultaneously | HTTP connections pile up, Render kills them |
| Poll timer loss | Deploy mid-class | Active poll just... disappears |
| Single point of failure | Render free tier restarts | Full outage during live class |

---

## 2. Target Architecture — The Vision

```
                    ┌─────────────────────────────────────┐
                    │         Vercel CDN / Edge            │
                    │   (React SPA + static assets)        │
                    └──────────────┬──────────────────────┘
                                   │ HTTPS / WSS
                    ┌──────────────▼──────────────────────┐
                    │         Load Balancer                │
                    │   (Render / Railway / Fly.io)        │
                    └──────────┬──────────────┬───────────┘
                               │              │
              ┌────────────────▼──┐    ┌──────▼────────────────┐
              │   Node Instance 1 │    │   Node Instance 2     │
              │  (Express + WS)   │    │  (Express + WS)       │
              └────────┬──────────┘    └──────────┬────────────┘
                       │                          │
                       └──────────┬───────────────┘
                                  │
              ┌───────────────────▼───────────────────────┐
              │               Redis (Upstash)              │
              │  ┌─────────────┐  ┌──────────────────────┐│
              │  │  Pub/Sub    │  │    Key-Value Cache    ││
              │  │ (WS fanout) │  │ (sessions, auth, etc) ││
              │  └─────────────┘  └──────────────────────┘│
              │  ┌─────────────┐  ┌──────────────────────┐│
              │  │  Job Queue  │  │   Rate Limit State   ││
              │  │ (BullMQ)    │  │ (distributed limits)  ││
              │  └─────────────┘  └──────────────────────┘│
              └───────────────────────────────────────────┘
                                  │
              ┌───────────────────▼───────────────────────┐
              │          PostgreSQL (Supabase)             │
              │  (Pool: 20 via PgBouncer transaction mode) │
              └───────────────────────────────────────────┘
                                  │
              ┌───────────────────▼───────────────────────┐
              │              AI Services                   │
              │  HuggingFace ──► Embedding Worker (BullMQ)│
              │  Mistral API ──► AI Job Worker (BullMQ)   │
              │  Pinecone    ──► Vector Search             │
              └───────────────────────────────────────────┘
```

---

## 3. Change 1 — Database Layer

### 3.1 Connection Pool

**Current:** `sas_b/db.js` line 19 — pool max: 5

**Problem:** Supabase free tier allows 15 connections. With 5, you exhaust the pool at 20 concurrent requests. Auth middleware alone consumes one per request.

**Change:** Switch to Supabase's built-in PgBouncer (transaction pooling mode). This multiplexes hundreds of app connections down to the 15 Supabase allows.

```js
// sas_b/db.js — REPLACE the connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Use Supabase pooler URL (port 6543)
  max: 20,           // App-side pool: safe with PgBouncer in front
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: { rejectUnauthorized: false }
});
```

**Supabase pooler URL format:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

> The key insight: use port **6543** (pooler) not **5432** (direct). This alone handles 200+ concurrent users.

---

### 3.2 Batch the Heartbeat Writes

**Current:** `sas_b/server.js` lines 408–424 — 1 DB `UPDATE` per student per 30s

**Problem:** 500 students = 16 individual DB writes/sec. Each holds a pool connection.

**Change:** Accumulate heartbeats in Redis, flush as a single batch every 30 seconds.

```js
// New pattern in server.js
const HEARTBEAT_BATCH_INTERVAL = 30_000;
const pendingHeartbeats = new Map(); // lives in Redis instead

// On heartbeat message:
await redis.hset('heartbeats', `${sessionId}:${userId}`, Date.now());

// Background worker (runs every 30s):
setInterval(async () => {
  const all = await redis.hgetall('heartbeats');
  if (!all || Object.keys(all).length === 0) return;

  const values = Object.entries(all)
    .map(([key, ts]) => {
      const [sessionId, studentId] = key.split(':');
      return `('${sessionId}', '${studentId}', to_timestamp(${ts}/1000.0))`;
    })
    .join(', ');

  await pool.query(`
    UPDATE session_participants AS sp
    SET last_activity = v.ts
    FROM (VALUES ${values}) AS v(session_id, student_id, ts)
    WHERE sp.session_id = v.session_id AND sp.student_id::text = v.student_id
  `);

  await redis.del('heartbeats');
}, HEARTBEAT_BATCH_INTERVAL);
```

**Result:** 500 students → 1 DB write per 30 seconds instead of 500.

---

### 3.3 Database Indexes

**Current:** No migration file for performance indexes.

**Create `sas_b/migrations/001_performance_indexes.sql`:**

```sql
-- Poll responses: analytics, gamification
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_poll_responses_session
  ON poll_responses(poll_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_poll_responses_student
  ON poll_responses(student_id);

-- Session participants: heartbeats, attendance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_participants_session
  ON session_participants(session_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_participants_student
  ON session_participants(student_id);

-- Polls: activation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_polls_session_active
  ON polls(session_id, is_active);

-- Knowledge card votes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_card_votes_pair
  ON knowledge_card_votes(pair_id);

-- Resource chunks: RAG retrieval
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resource_chunks_resource
  ON resource_chunks(resource_id);

-- Sessions: teacher dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_teacher
  ON sessions(teacher_id, created_at DESC);
```

**Why `CONCURRENTLY`:** These run without locking the table. Safe to run on a live production database.

---

### 3.4 Paginate Analytics

**Current:** `sas_b/routes/analytics.js` — fetches all sessions, all polls, all responses in one query.

**Change:** Add pagination to session listing, and pre-aggregate poll stats with a materialized view.

```sql
-- sas_b/migrations/002_analytics_materialized_view.sql
CREATE MATERIALIZED VIEW session_stats AS
SELECT
  p.session_id,
  COUNT(DISTINCT p.id) as total_polls,
  COUNT(DISTINCT pr.student_id) as responding_students,
  AVG(CASE WHEN pr.is_correct THEN 1.0 ELSE 0.0 END) as avg_accuracy,
  COUNT(pr.id) as total_responses
FROM polls p
LEFT JOIN poll_responses pr ON pr.poll_id = p.id
GROUP BY p.session_id;

CREATE UNIQUE INDEX ON session_stats(session_id);
```

```js
// routes/analytics.js — paginated endpoint
router.get('/teacher/:teacherId/sessions', authenticateToken, authorize('teacher'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * Math.min(limit, 50);

  const sessions = await pool.query(`
    SELECT s.*, ss.total_polls, ss.responding_students, ss.avg_accuracy
    FROM sessions s
    LEFT JOIN session_stats ss ON ss.session_id = s.id
    WHERE s.teacher_id = $1
    ORDER BY s.created_at DESC
    LIMIT $2 OFFSET $3
  `, [req.params.teacherId, limit, offset]);

  res.json({ sessions: sessions.rows, page, hasMore: sessions.rows.length === limit });
});
```

---

## 4. Change 2 — Redis as the Shared Nervous System

Redis is the single change that unlocks everything else: horizontal scaling, WebSocket pub/sub, async job queues, distributed caching, and session state persistence.

### 4.1 Setup

**Install:**
```bash
cd sas_b
npm install ioredis bullmq
```

**Provider:** Upstash Redis (Vercel Marketplace, or upstash.com directly — free tier: 10,000 commands/day; paid: $0.20/100k commands)

**`sas_b/redis.js` — new file:**
```js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

// Pub/Sub requires a separate connection
const redisPub = new Redis(process.env.REDIS_URL, { lazyConnect: true });
const redisSub = new Redis(process.env.REDIS_URL, { lazyConnect: true });

module.exports = { redis, redisPub, redisSub };
```

### 4.2 Replace Every In-Memory Map

**Current in `server.js`:**
```js
const sessionConnections = new Map();
const attendanceWindows = new Map();
const heartbeatLastUpdate = new Map();
const revealInProgress = new Set();
```

**Replace with Redis-backed equivalents:**

```js
// Attendance windows → persisted to DB + cached in Redis
// Key: attendance:window:{sessionId}
// Value: JSON { windowId, closesAt, markedStudentIds[] }
// TTL: duration of window + 5 min buffer

async function openAttendanceWindow(sessionId, windowId, durationSeconds) {
  const data = { windowId, closesAt: Date.now() + (durationSeconds * 1000), markedStudentIds: [] };
  await redis.setex(`attendance:window:${sessionId}`, durationSeconds + 300, JSON.stringify(data));
  // Also write to DB for crash recovery
  await pool.query(
    'INSERT INTO attendance_windows (session_id, window_id, closes_at) VALUES ($1, $2, $3)',
    [sessionId, windowId, new Date(data.closesAt)]
  );
}

// Poll reveal guard → Redis SET with NX (only one instance can set it)
async function claimPollReveal(pollId) {
  const result = await redis.set(`reveal:${pollId}`, '1', 'EX', 30, 'NX');
  return result === 'OK'; // Only one instance proceeds
}

// Poll timers → stored in Redis so any instance can pick them up on startup
async function schedulePollTimer(sessionId, pollId, endTimeMs) {
  await redis.setex(`poll:timer:${sessionId}`, Math.ceil((endTimeMs - Date.now()) / 1000) + 10,
    JSON.stringify({ pollId, endTimeMs }));
}
```

---

## 5. Change 3 — WebSocket Architecture

### 5.1 The Core Problem

```
Instance 1                Instance 2
┌──────────────┐          ┌──────────────┐
│ Teacher WS   │          │ 150 Students │
│ sessionConns │          │ sessionConns │
│  Map: [...]  │          │  Map: [...]  │
└──────────────┘          └──────────────┘
    Teacher broadcasts "activate-poll"
    → only reaches 0 students (they're on Instance 2)
```

### 5.2 Redis Pub/Sub Fan-Out

**How it works:** Instead of iterating a local Map, each instance publishes to a Redis channel. Every instance subscribes and forwards to its local connections.

```js
// sas_b/server.js — REPLACE broadcast logic

const { redisPub, redisSub } = require('./redis');

// Subscribe to all session channels on startup
redisSub.psubscribe('session:*', (err) => {
  if (err) logger.error('Redis subscribe error', err);
});

// When Redis delivers a message, forward to local WebSocket connections
redisSub.on('pmessage', (pattern, channel, message) => {
  const sessionId = channel.replace('session:', '');
  const connections = sessionConnections.get(sessionId) || [];
  const payload = message; // already JSON string

  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
});

// REPLACE all direct ws.send() broadcast calls with this:
async function broadcastToSession(sessionId, data) {
  const payload = JSON.stringify(data);
  await redisPub.publish(`session:${sessionId}`, payload);
  // Redis delivers this to ALL instances including this one via redisSub
}

// Usage (replaces all existing forEach broadcast loops):
await broadcastToSession(sessionId, {
  type: 'poll-activated',
  poll: pollData,
  poll_end_time: endTime
});
```

### 5.3 Sticky Sessions for WebSocket

WebSocket connections are stateful — a client must always reconnect to the same instance (or use Redis pub/sub, which solves the message delivery issue but not the connection management).

**On Render:** Add `sessionAffinity: true` to render.yaml. On Railway or Fly.io, sticky sessions are configured at the load balancer.

**Fallback:** If sticky sessions aren't available, the pub/sub approach above solves the delivery problem regardless of which instance holds the connection.

### 5.4 Persist Poll Timers

**Current:** `global.pollTimers` is a Map — lost on restart.

**Change:** On server startup, read active polls from DB and re-arm timers:

```js
// sas_b/server.js — add to startup sequence
async function rearmPollTimers() {
  const result = await pool.query(`
    SELECT p.id as poll_id, p.session_id, p.poll_end_time
    FROM polls p
    WHERE p.is_active = true
      AND p.poll_end_time > NOW()
  `);

  for (const row of result.rows) {
    const msRemaining = new Date(row.poll_end_time) - Date.now();
    if (msRemaining > 0) {
      setTimeout(() => revealPollResults(row.session_id, row.poll_id), msRemaining);
      logger.info(`Re-armed timer for poll ${row.poll_id}, ${msRemaining}ms remaining`);
    }
  }
}

// Call after pool is ready:
rearmPollTimers().catch(err => logger.error('Failed to rearm poll timers', err));
```

### 5.5 Graceful WebSocket Shutdown

```js
// sas_b/server.js — add graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  // Stop accepting new HTTP connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Notify all WebSocket clients to reconnect
  wss.clients.forEach(ws => {
    ws.send(JSON.stringify({ type: 'server-restart', reconnectIn: 3000 }));
    ws.close(1001, 'Server restarting');
  });

  // Drain pool
  await pool.end();
  await redis.quit();

  process.exit(0);
});
```

**Frontend handler:**
```js
// SAS-EDU-AI_F/src/hooks/useWebSocket.js — add reconnect handler
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'server-restart') {
    setTimeout(() => reconnect(), msg.reconnectIn);
    return;
  }
  // ... normal message handling
};
```

---

## 6. Change 4 — AI & RAG Pipeline

### 6.1 The Core Problem

```
Current flow (synchronous, blocking):
Student clicks "Ask AI"
   → POST /api/ai-search/session/:id
   → Query classification (Mistral Small, 2-3s)
   → Embed query (HuggingFace, 1-2s)
   → Pinecone search (0.5s)
   → RAG response (Mistral Large, 20-45s)
   ← HTTP connection held open entire time
   ← Render kills connection after 30s (free tier)
```

### 6.2 Async Job Queue (BullMQ)

**Install:**
```bash
npm install bullmq
```

**`sas_b/queues/aiQueue.js` — new file:**
```js
const { Queue, Worker } = require('bullmq');
const { redis } = require('../redis');
const ragService = require('../services/ragService');

// Queue: AI queries submitted here
const aiQueue = new Queue('ai-queries', { connection: redis });

// Queue: Vectorization jobs submitted here
const vectorQueue = new Queue('vectorization', { connection: redis });

// Worker: processes AI queries (can run 3 concurrently)
const aiWorker = new Worker('ai-queries', async (job) => {
  const { sessionId, query, userId, mode, jobId } = job.data;

  // Store progress in Redis so client can poll
  await redis.hset(`ai:job:${jobId}`, { status: 'processing', progress: 0 });

  const result = await ragService.query(sessionId, query, mode);

  await redis.hset(`ai:job:${jobId}`, {
    status: 'complete',
    result: JSON.stringify(result),
    completedAt: Date.now()
  });
  await redis.expire(`ai:job:${jobId}`, 300); // Keep for 5 minutes

}, { connection: redis, concurrency: 3 }); // Max 3 LLM calls at once

aiWorker.on('failed', async (job, err) => {
  await redis.hset(`ai:job:${job.data.jobId}`, {
    status: 'failed',
    error: err.message
  });
});

module.exports = { aiQueue, vectorQueue };
```

**Route changes in `sas_b/routes/ai-search.js`:**
```js
const { aiQueue } = require('../queues/aiQueue');
const { v4: uuidv4 } = require('uuid');

// BEFORE: blocking 30-60s request
// AFTER: immediate 202 response with job ID
router.post('/session/:sessionId', authenticateToken, async (req, res) => {
  const jobId = uuidv4();
  const { query, mode = 'answer' } = req.body;

  await aiQueue.add('query', {
    jobId,
    sessionId: req.params.sessionId,
    userId: req.user.id,
    query,
    mode
  });

  // Return immediately — client polls /ai-search/job/:jobId
  res.status(202).json({ jobId, status: 'queued' });
});

// Client polls this endpoint for result
router.get('/job/:jobId', authenticateToken, async (req, res) => {
  const job = await redis.hgetall(`ai:job:${req.params.jobId}`);

  if (!job || Object.keys(job).length === 0) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'complete') {
    return res.json({ status: 'complete', result: JSON.parse(job.result) });
  }

  res.json({ status: job.status, progress: job.progress || 0 });
});
```

**Frontend polling in `SAS-EDU-AI_F/src/hooks/useAIQuery.js`:**
```js
async function submitAIQuery(sessionId, query, mode) {
  // Submit job
  const { jobId } = await apiRequest('POST', `/ai-search/session/${sessionId}`, { query, mode });

  // Poll for result (max 90s)
  const startTime = Date.now();
  while (Date.now() - startTime < 90_000) {
    await sleep(1500); // Poll every 1.5s
    const status = await apiRequest('GET', `/ai-search/job/${jobId}`);

    if (status.status === 'complete') return status.result;
    if (status.status === 'failed') throw new Error('AI query failed, please retry');
  }
  throw new Error('Query timed out');
}
```

---

### 6.3 Vectorization Queue

**Current:** Document upload → node process blocks for 2-3 minutes doing sequential embedding.

**Change:** Upload response is immediate. Vectorization runs as a background job.

```js
// sas_b/routes/resources.js — upload endpoint
const { vectorQueue } = require('../queues/aiQueue');

router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  // Save file metadata to DB immediately
  const resource = await pool.query(
    'INSERT INTO resources (session_id, filename, file_url, status) VALUES ($1, $2, $3, $4) RETURNING id',
    [sessionId, req.file.originalname, fileUrl, 'processing']
  );

  // Upload raw file to Supabase Storage
  await supabase.storage.from('session-resources').upload(filePath, req.file.buffer);

  // Queue vectorization as background job
  await vectorQueue.add('vectorize', {
    resourceId: resource.rows[0].id,
    filePath,
    mimeType: req.file.mimetype
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  });

  // Return immediately — don't wait for vectorization
  res.json({
    resourceId: resource.rows[0].id,
    status: 'processing',
    message: 'File uploaded. Vectorization in progress.'
  });
});
```

**Vectorization worker:**
```js
const vectorWorker = new Worker('vectorization', async (job) => {
  const { resourceId, filePath, mimeType } = job.data;

  // Download file from Supabase
  const { data } = await supabase.storage.from('session-resources').download(filePath);
  const buffer = Buffer.from(await data.arrayBuffer());

  // Parse document
  const chunks = await documentProcessor.parse(buffer, mimeType);

  // Batch embed (send all chunks at once, not one-by-one)
  const embeddings = await embeddingService.batchEmbed(chunks.map(c => c.text));

  // Upsert to Pinecone
  await vectorStore.upsertChunks(resourceId, chunks, embeddings);

  // Update resource status
  await pool.query('UPDATE resources SET status = $1 WHERE id = $2', ['ready', resourceId]);

}, { connection: redis, concurrency: 2 }); // Max 2 vectorizations at once
```

---

### 6.4 Batch Embedding

**Current:** `sas_b/services/embeddingService.js` lines 65–88 — awaits each chunk individually with 1s delay.

**Change:** HuggingFace's `feature-extraction` endpoint accepts arrays. Send all chunks in one request.

```js
// sas_b/services/embeddingService.js — REPLACE batchEmbed method
async batchEmbed(texts, batchSize = 32) {
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${this.model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: batch, options: { wait_for_model: true } })
      }
    );

    const embeddings = await response.json();

    if (!Array.isArray(embeddings)) {
      throw new Error(`HuggingFace batch embed failed: ${JSON.stringify(embeddings)}`);
    }

    results.push(...embeddings);
    // Respectful delay between batches, not between individual chunks
    if (i + batchSize < texts.length) await this.sleep(500);
  }

  return results;
}
```

**Result:** 100 chunks → 4 API calls instead of 100. Total time: ~3 seconds instead of 110 seconds.

---

## 7. Change 5 — File Upload Pipeline

### 7.1 Stream Directly to Supabase

**Current:** `multer.memoryStorage()` buffers the entire file in Node.js RAM.

**Change:** Use signed upload URLs so the browser uploads directly to Supabase Storage, completely bypassing your Node.js server.

```js
// sas_b/routes/resources.js — new signed URL flow

// Step 1: Client requests a signed upload URL
router.post('/upload-url', authenticateToken, authorize('teacher'), async (req, res) => {
  const { filename, mimeType, sessionId } = req.body;

  const filePath = `sessions/${sessionId}/${Date.now()}-${filename}`;

  // Create signed URL valid for 5 minutes
  const { data, error } = await supabase.storage
    .from('session-resources')
    .createSignedUploadUrl(filePath);

  if (error) return res.status(500).json({ error: 'Could not create upload URL' });

  // Pre-register resource in DB with 'pending' status
  const resource = await pool.query(
    'INSERT INTO resources (session_id, filename, file_path, status) VALUES ($1, $2, $3, $4) RETURNING id',
    [sessionId, filename, filePath, 'pending']
  );

  res.json({
    signedUrl: data.signedUrl,
    token: data.token,
    resourceId: resource.rows[0].id,
    filePath
  });
});

// Step 2: After browser uploads, client notifies server to start vectorization
router.post('/upload-complete', authenticateToken, async (req, res) => {
  const { resourceId, filePath, mimeType } = req.body;

  await pool.query('UPDATE resources SET status = $1 WHERE id = $2', ['processing', resourceId]);

  await vectorQueue.add('vectorize', { resourceId, filePath, mimeType }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  });

  res.json({ status: 'processing' });
});
```

**Frontend upload flow:**
```js
// SAS-EDU-AI_F/src/utils/upload.js
async function uploadResource(file, sessionId) {
  // 1. Get signed URL
  const { signedUrl, token, resourceId } = await apiRequest('POST', '/resources/upload-url', {
    filename: file.name,
    mimeType: file.type,
    sessionId
  });

  // 2. Upload directly to Supabase (bypasses your Node server entirely)
  await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
    // This goes directly to Supabase CDN — zero load on your backend
  });

  // 3. Notify backend to start vectorization
  await apiRequest('POST', '/resources/upload-complete', {
    resourceId,
    mimeType: file.type
  });

  return resourceId;
}
```

**Impact:** Eliminates the 500MB RAM spike. Your Node.js server handles two tiny JSON requests instead of streaming 50MB files through memory.

---

## 8. Change 6 — Authentication Layer

### 8.1 Cache Auth DB Queries

**Current:** Every request = 1 DB query just to look up the user.

**Change:** Cache user records in Redis with 5-minute TTL.

```js
// sas_b/middleware/auth.js — ADD caching
const { redis } = require('../redis');

async function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check Redis cache first
  const cacheKey = `auth:user:${decoded.userId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    req.user = JSON.parse(cached);
    return next();
  }

  // Cache miss — fetch from DB
  const result = await pool.query('SELECT id, email, role, name FROM users WHERE id = $1', [decoded.userId]);

  if (!result.rows.length) return res.status(401).json({ error: 'User not found' });

  const user = result.rows[0];

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(user));

  req.user = user;
  next();
}
```

**Impact:** 200 students → from 200 DB queries/sec down to ~1 DB query per 5 minutes per user.

---

### 8.2 JWT Revocation

**Current:** No way to invalidate a JWT. Compromised token valid for 24 hours.

**Change:** Add a `jti` (JWT ID) claim and a Redis revocation set.

```js
// sas_b/routes/auth.js — when issuing tokens
const { v4: uuidv4 } = require('uuid');

const jti = uuidv4();
const token = jwt.sign(
  { userId: user.id, role: user.role, jti },
  process.env.JWT_SECRET,
  { expiresIn: '24h', algorithm: 'HS256' }
);

// sas_b/middleware/auth.js — check revocation
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const isRevoked = await redis.sismember('revoked:tokens', decoded.jti);
if (isRevoked) return res.status(401).json({ error: 'Token has been revoked' });

// sas_b/routes/auth.js — logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  const decoded = jwt.decode(req.headers.authorization.split(' ')[1]);
  await redis.sadd('revoked:tokens', decoded.jti);
  await redis.expireat('revoked:tokens', decoded.exp); // TTL matches token expiry
  res.json({ message: 'Logged out successfully' });
});
```

---

## 9. Change 7 — Frontend Architecture

### 9.1 Replace HTTP Polling with WebSocket Push

**Current:** `EnhancedStudentDashboard.jsx` — polls HTTP every 30 seconds.

**Change:** The WebSocket is already open. Use it.

```js
// SAS-EDU-AI_F/src/components/student/EnhancedStudentDashboard.jsx

// REMOVE:
// const refreshInterval = setInterval(() => { fetchStudentData(); }, 30000);

// ADD — respond to WebSocket push events:
useEffect(() => {
  const ws = getWebSocket(); // existing WS connection

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'points-updated':
        setStudentStats(prev => ({ ...prev, points: msg.points, level: msg.level }));
        break;
      case 'badge-earned':
        setNewBadge(msg.badge);
        showBadgeNotification(msg.badge);
        break;
      case 'leaderboard-updated':
        setLeaderboard(msg.leaderboard);
        break;
    }
  });

  // One-time fetch on mount — then rely on WS for updates
  fetchStudentData();
}, []);
```

**Backend sends these events after relevant DB writes:**
```js
// In poll reveal handler (server.js)
await broadcastToSession(sessionId, {
  type: 'points-updated',
  studentId: studentId,
  points: newTotalPoints,
  level: newLevel
});
```

---

### 9.2 Fix `setInterval` Memory Leaks

Every `setInterval` in teacher/student components must be cleaned up:

```js
// Pattern to apply across ALL components:
// SAS-EDU-AI_F/src/components/teacher/EnhancedSessionManagement.jsx

useEffect(() => {
  // Start interval
  const notesPollingId = setInterval(fetchNotesStatus, 5000);

  // CRITICAL: return cleanup function
  return () => {
    clearInterval(notesPollingId);
  };
}, []); // dependency array must be correct

// For components with multiple intervals:
useEffect(() => {
  const ids = [
    setInterval(fetchAttendanceStatus, 3000),
    setInterval(updateTimer, 1000),
  ];

  return () => ids.forEach(clearInterval);
}, []);
```

---

### 9.3 Cache User Object in Memory (Not localStorage on Every Call)

**Current:** `api.js` calls `localStorage.getItem('currentUser')` on every request — synchronous, blocks main thread.

**Change:** Read once at app startup into React context, derive from context everywhere.

```js
// SAS-EDU-AI_F/src/context/AuthContext.jsx — new file
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Read localStorage ONCE at mount — synchronous read only happens here
    try {
      const str = localStorage.getItem('currentUser');
      return str ? JSON.parse(str) : null;
    } catch { return null; }
  });

  const updateUser = (newUser) => {
    setUser(newUser);
    localStorage.setItem('currentUser', JSON.stringify(newUser));
  };

  return (
    <AuthContext.Provider value={{ user, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

```js
// SAS-EDU-AI_F/src/utils/api.js — REPLACE safeParseUser with context
// Remove localStorage.getItem calls from apiRequest
// Pass token from memory (from AuthContext) instead
```

---

### 9.4 Add SSE Event IDs for Reconnection

**Current:** `useAIChat.js` — SSE stream has no `id:` field. Reconnection loses progress.

```js
// sas_b — SSE response (any streaming endpoint)
// ADD id field to each SSE event:
res.write(`id: ${chunkIndex}\n`);
res.write(`event: chunk\n`);
res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);

// Frontend — EventSource reconnect handling:
const source = new EventSource(url);
// Browser automatically sends Last-Event-ID header on reconnect
// Server reads req.headers['last-event-id'] to resume from that chunk
```

---

## 10. Change 8 — Observability & Resilience

### 10.1 Health Check Endpoint

Required by any load balancer, Render, Railway, or Fly.io health probe.

```js
// sas_b/routes/health.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { redis } = require('../redis');

router.get('/health', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: 'unknown',
    redis: 'unknown'
  };

  try {
    await pool.query('SELECT 1');
    checks.db = 'healthy';
  } catch (err) {
    checks.db = 'unhealthy';
  }

  try {
    await redis.ping();
    checks.redis = 'healthy';
  } catch (err) {
    checks.redis = 'degraded'; // Not fatal — in-memory fallback
  }

  const allHealthy = checks.db === 'healthy';
  res.status(allHealthy ? 200 : 503).json(checks);
});

module.exports = router;
```

---

### 10.2 Fix Async `forEach` Logging

**Current:** `sas_b/routes/ai-search.js` line 104 — fire-and-forget promises.

```js
// REPLACE:
resources.forEach(async (resource) => {
  await supabase.from('resource_access_logs').insert({ ... });
});

// WITH:
await Promise.allSettled(
  resources.map(resource =>
    supabase.from('resource_access_logs').insert({
      resource_id: resource.id,
      student_id: req.user.id,
      session_id: req.params.sessionId,
      accessed_at: new Date()
    })
  )
);
```

Or better — batch all inserts into one:
```js
const logEntries = resources.map(r => ({
  resource_id: r.id,
  student_id: req.user.id,
  session_id: req.params.sessionId,
  accessed_at: new Date()
}));

await supabase.from('resource_access_logs').insert(logEntries);
```

---

### 10.3 Leaderboard N+1 Fix

**Current:** `sas_b/routes/gamification.js` lines 159–179 — 1 query per pair.

```js
// REPLACE per-pair queries with single GROUP BY:
async function getPairVotesAll(pairIds) {
  const result = await pool.query(`
    SELECT
      pair_id,
      SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS thumbs_up,
      SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS thumbs_down,
      COUNT(*) AS total
    FROM knowledge_card_votes
    WHERE pair_id = ANY($1)
    GROUP BY pair_id
  `, [pairIds]);

  // Return as Map for O(1) lookup
  return new Map(result.rows.map(r => [r.pair_id, r]));
}

// Usage:
const pairIds = pairs.map(p => p.id);
const voteMap = await getPairVotesAll(pairIds);
const pairsWithVotes = pairs.map(p => ({ ...p, votes: voteMap.get(p.id) || { thumbs_up: 0, thumbs_down: 0 } }));
```

---

## 11. Migration Roadmap

### Phase 1 — Zero-Risk Fixes (Week 1, ~8 hours)

These are safe changes that can be deployed immediately without touching architecture.

| Task | File | Time | Impact |
|---|---|---|---|
| Switch to Supabase pooler URL + raise pool to 20 | `sas_b/db.js` | 30 min | Unblocks 200+ users |
| Fix `async forEach` → single batch insert | `sas_b/routes/ai-search.js:104` | 45 min | Eliminates silent failures |
| Fix `setInterval` cleanup in all React components | Frontend components | 2 hr | Eliminates memory leaks |
| Add DB indexes migration | New migration file | 2 hr | 5-10x query speedup |
| Add `GET /health` endpoint | `sas_b/routes/health.js` | 1 hr | Enables load balancer probes |
| Fix leaderboard N+1 queries | `sas_b/routes/gamification.js` | 1 hr | Faster leaderboard |
| Batch heartbeat writes | `sas_b/server.js` | 90 min | 500x fewer DB writes |
| Persist attendance windows to DB | `sas_b/server.js` | 1 hr | Survives restarts |

---

### Phase 2 — Add Redis (Week 2, ~3 days)

Dependencies: Phase 1 complete. Requires Upstash Redis account.

| Task | Time | Unlocks |
|---|---|---|
| Provision Upstash Redis, add `redis.js` | 2 hr | All subsequent |
| Cache JWT auth lookups (5-min TTL) | 3 hr | 95% reduction in auth DB queries |
| Replace in-memory Maps with Redis | 4 hr | State survives restarts |
| Add Redis pub/sub for WebSocket broadcast | 6 hr | Horizontal scaling |
| Add JWT revocation via Redis SET | 2 hr | Security improvement |
| Paginate analytics queries | 3 hr | Dashboard loads instantly |

---

### Phase 3 — Async AI Pipeline (Week 3, ~3 days)

Dependencies: Phase 2 complete (Redis required for BullMQ).

| Task | Time | Unlocks |
|---|---|---|
| Add BullMQ, create AI query queue + worker | 4 hr | Non-blocking AI queries |
| Add vectorization queue + worker | 4 hr | Non-blocking file uploads |
| Batch embedding API calls | 2 hr | 100-chunk embed in 3s, not 110s |
| Switch to signed upload URLs (direct-to-Supabase) | 4 hr | Eliminates 500MB RAM spikes |
| Re-arm poll timers on startup | 2 hr | Poll timers survive deploys |
| Frontend: polling → WebSocket push for dashboard | 4 hr | Real-time dashboard updates |

---

### Phase 4 — Horizontal Scaling (Month 2)

Dependencies: Phases 1–3 complete.

| Task | Impact |
|---|---|
| Add graceful shutdown handler (SIGTERM) | Zero-downtime deploys |
| Configure sticky sessions on load balancer | WebSocket reconnection handling |
| Move to Render paid tier or Railway (multi-instance) | 2+ Node processes |
| Add Bull Board dashboard for job visibility | Monitor AI queue health |
| Cache-Control + ETag headers on API responses | Browser-level caching |

---

## 12. Infrastructure Topology

### Current vs Target

```
CURRENT:
Browser → Render Free Tier (1 process) → Supabase PostgreSQL
                                        → Mistral API
                                        → HuggingFace
                                        → Pinecone

AFTER PHASE 1+2:
Browser → Render Starter ($7/mo)   → Supabase PostgreSQL (pooler)
                 │                 → Upstash Redis ($0-20/mo)
                 │                 → Mistral API
                 └─────────────────→ HuggingFace (batch mode)
                                   → Pinecone

AFTER PHASE 3+4:
Browser → Render (2 instances)     → Supabase PostgreSQL (pooler)
            ↕ Redis pub/sub        → Upstash Redis (pub/sub + jobs)
                                   → BullMQ Workers (AI, vectorization)
                                   → Mistral API (queue-controlled rate)
                                   → HuggingFace (batch)
                                   → Pinecone
```

### Estimated Monthly Cost at 1,000 Active Students

| Service | Current | After Phase 3 |
|---|---|---|
| Render (backend) | $0 (free, sleeps) | $14 (2x starter, always-on) |
| Supabase (DB) | $0 (free tier) | $25 (pro, more connections) |
| Upstash Redis | $0 (not used) | $10 (pay-per-use) |
| Vercel (frontend) | $0 (free tier) | $0 (hobby is sufficient) |
| Mistral API | ~$5/mo | ~$15/mo (more usage) |
| HuggingFace | $0 (free inference) | $9 (pro inference, faster) |
| Pinecone | $0 (free tier) | $0 (free: 100k vectors) |
| **Total** | **~$5/mo** | **~$73/mo** |

> At 1,000 active students, $73/month works out to **$0.07 per student per month**. The free tier breaks down around 100 concurrent users. $73/month handles 1,000+.

---

*Last updated: 2026-03-26. Architecture targets Render for compute, Supabase for PostgreSQL, and Upstash for Redis.*

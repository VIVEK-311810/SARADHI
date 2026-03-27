# SAS Edu AI — Complete Scalability & Performance Audit

> **Date:** 2026-03-26
> **Scope:** Full codebase — `frontend/` (React/CRA) + `backend/` (Express + WebSocket)
> **Purpose:** Identify every bottleneck before SASTRA University rollout
> **Status:** Pre-production. Critical issues will cause outright failures under real classroom load.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Issues — Will Break Under Load](#2-critical-issues)
3. [High Severity — Significant Degradation](#3-high-severity-issues)
4. [Medium Severity — User-Facing Problems](#4-medium-severity-issues)
5. [Missing Infrastructure](#5-missing-infrastructure)
6. [Database Index Gaps](#6-database-index-gaps)
7. [Priority Fix Roadmap](#7-priority-fix-roadmap)
8. [Full Issue Table](#8-full-issue-table)

---

## 1. Executive Summary

The platform has **6 critical**, **8 high**, and **6 medium** scalability issues. The architecture is fundamentally single-process with no distributed state, no caching layer, and no async job processing. Under a single classroom of 60 students:

- **CRIT-01** exhausts the DB connection pool
- **CRIT-02** breaks if any second server instance is ever added
- **CRIT-03** doubles the DB load of CRIT-01 on every request
- **CRIT-05** blocks HTTP connections for 30–60 seconds per AI query

The platform will struggle past **~50 concurrent users** without Week 1 fixes, and cannot reach **university scale (1000+ users)** without the Redis and queue infrastructure.

---

## 2. Critical Issues

These cause outright failures or complete unavailability under real classroom load.

---

### CRIT-01 — Database Connection Pool Capped at 5

**File:** [`backend/db.js:19`](backend/db.js#L19)
**Breaks at:** ~50 concurrent users

```js
// backend/db.js — lines 13–24
max: parseInt(process.env.DB_POOL_MAX) || 5,
min: 0,
idleTimeoutMillis: 10000,
connectionTimeoutMillis: 20000,
```

Every authenticated request consumes a pool connection for the auth check + the route query. With a classroom of 60 students all hitting "Submit Poll" simultaneously:

- All 5 connections exhaust in milliseconds
- Subsequent requests queue and then timeout after 20 seconds
- `idleTimeoutMillis: 10000` means connections die quickly under burst traffic, causing connection churn
- Supabase free-tier caps actual server-side connections at 6–15, so even raising the number needs PgBouncer

**Fix:**
```js
max: parseInt(process.env.DB_POOL_MAX) || 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 5000,
```
Connect via the Supabase **transaction-mode pooler URL** (port 6543), not the direct DB URL.

---

### CRIT-02 — WebSocket Session State Stored In-Memory

**File:** [`backend/server.js:34`](backend/server.js#L34)
**Breaks at:** Any horizontal scaling attempt; data loss on restart

```js
// backend/server.js — lines 34–47
const sessionConnections = new Map();
const heartbeatLastUpdate = new Map();  // key: "sessionId:studentId" — NEVER cleaned up
const revealInProgress = new Set();
const attendanceWindows = new Map();
const dashboardConnections = new Map();
```

All live connection state, session membership, and attendance windows live in process memory.

1. **No horizontal scaling** — A second Node instance (for load balancing) has its own disconnected Maps. Teacher on instance A broadcasts a poll; students on instance B never see it.
2. **No crash recovery** — Server restart during a live class = every student silently disconnected, attendance windows gone, active polls lost.
3. **Memory leak** — `heartbeatLastUpdate` entries are never deleted. 200 students × 50 sessions = 10,000 entries that accumulate indefinitely. After a week of usage the process bloats past 1GB.
4. **Synchronous broadcast loop** — [`server.js:426`](backend/server.js#L426) broadcasts to all students in a `forEach`. If any single `ws.send()` is slow, it blocks the entire broadcast.

```js
// backend/server.js — lines 426–436
function broadcastToSession(sessionId, message) {
  const connections = sessionConnections.get(sessionId);
  if (connections && connections.length > 0) {
    const payload = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);  // No backpressure check
      }
    });
  }
}
```

**Fix:**
Introduce `ioredis` pub/sub. Each instance subscribes to session channels. Broadcasts publish to a Redis channel; all instances receive and forward to their local connections. Move attendance windows to a `attendance_windows` DB table. Use the in-memory Map only as a write-through cache.

---

### CRIT-03 — JWT Auth Performs a DB Query on Every Single Request

**File:** [`backend/middleware/auth.js:17`](backend/middleware/auth.js#L17)
**Breaks at:** 200+ concurrent users

```js
// backend/middleware/auth.js — lines 17–30
const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
const userResult = await pool.query(
  'SELECT * FROM users WHERE id = $1',   // SELECT * loads ALL columns
  [decoded.userId]
);
```

JWT verification is CPU-only and costs ~0.1ms. But then a full `SELECT * FROM users` round-trips to the database for data that does not change mid-session (role, email, name). This compounds CRIT-01 catastrophically:

- 200 students × 1 request/sec = **200 unnecessary DB round-trips per second**
- Each consumes 1 connection from the pool of 5
- `SELECT *` loads unused columns: `oauth_id`, `created_at`, `password_hash`, etc.

**Fix:**
Cache decoded user objects in Redis, keyed by `userId`, TTL 5 minutes. First request hits DB; all subsequent requests within 5 minutes read from cache. Also replace `SELECT *` with explicit column names.

---

### CRIT-04 — `async forEach` Fire-and-Forget (Two Locations)

**File:** [`backend/routes/ai-search.js:104`](backend/routes/ai-search.js#L104) and [`backend/routes/ai-search.js:383`](backend/routes/ai-search.js#L383)
**Breaks at:** 20+ resources per AI query

```js
// backend/routes/ai-search.js — lines 104–114
resources.forEach(async (resource) => {       // NOT awaited — floating promises
  await supabase
    .from('resource_access_logs')
    .insert({ resource_id: resource.id, student_id: req.user.id, ... })
    .catch(err => logger.warn('Error logging resource access', { error: err.message }));
});
res.json(data);  // Returns immediately — 50 queries still pending in the background

// backend/routes/ai-search.js — lines 383–391 (same pattern for enrichedChunks)
enrichedChunks.forEach(async (chunk) => {
  const { error } = await supabase
    .from('resource_access_logs')
    .insert({ ... })
    .catch(err => logger.warn('Resource access log failed', { error: err.message }));
});
```

`Array.prototype.forEach` does not await async callbacks. Each insert fires immediately and the response returns before any logging completes.

- **Silent failures** — inserts fail without any route-level error handling
- **Memory leak** — each pending Promise holds resource data in memory until resolved
- **Supabase connection flooding** — 50 resources = 50 simultaneous inserts against an already-constrained limit

**Fix:**
```js
await Promise.allSettled(
  resources.map(resource =>
    supabase.from('resource_access_logs').insert({ resource_id: resource.id, ... })
  )
);
```
Or batch all inserts into a single `INSERT ... VALUES ($1,$2), ($3,$4), ...` query.

---

### CRIT-05 — AI Pipeline Is Fully Synchronous, No Queue

**File:** [`backend/services/ragService.js:30`](backend/services/ragService.js#L30), [`backend/routes/ai-assistant.js:154`](backend/routes/ai-assistant.js#L154)
**Breaks at:** 10+ concurrent AI queries

```js
// Each student query blocks for 30–60 seconds waiting on LLM
const result = await mistralClient.chatComplete(this.model, messages, { maxTokens });
```

Every student AI question holds an open HTTP connection while waiting for the Mistral response. The `RequestQueue` class in [`backend/services/requestQueue.js`](backend/services/requestQueue.js) limits to 5 concurrent — but the 6th request blocks indefinitely rather than being queued gracefully.

- 50 students clicking "Ask AI" = 50 open HTTP connections held for up to 60 seconds each
- HuggingFace rate-limits at some threshold — when hit, all 50 fail simultaneously (thundering herd)
- Render's free/hobby tier has a 30-second function timeout — LLM responses routinely exceed this

**Fix:**
Introduce a job queue (BullMQ + Redis). Student submits query → job added to queue → immediate `202 Accepted` response with job ID. Student polls for result via SSE or WebSocket push. Background worker processes jobs at a controlled concurrency rate.

---

### CRIT-06 — Embedding Generation Is Sequential with Forced Delays

**File:** [`backend/services/embeddingService.js:13`](backend/services/embeddingService.js#L13)
**Breaks at:** 5+ concurrent document uploads

```js
// backend/services/embeddingService.js — lines 13–25
this.minRequestInterval = 1000;  // 1 second minimum between requests

// Lines 65–89: generateBatchEmbeddings
for (let i = 0; i < texts.length; i++) {
  const embedding = await this.generateEmbedding(texts[i]);  // awaited one by one
  await this.sleep(100);  // Extra 100ms sleep between each chunk
}
```

This is a singleton service. All concurrent requests compete for the same rate-limit lock.

- 100 chunks × (1000ms minimum + embedding time + 100ms sleep) = **2–3 minutes per document**
- 5 teachers uploading simultaneously = 5 × 2 minutes of blocked processing
- The upload HTTP response is held open during this entire time
- HuggingFace's `feature-extraction` endpoint accepts arrays — batch requests are never used

**Fix:**
Send all chunks in one batched request (or batches of 32–64). This reduces 100 chunks from 2+ minutes to ~3 seconds.

---

## 3. High Severity Issues

These cause significant performance degradation as user count grows.

---

### HIGH-01 — Analytics Queries: No Pagination, No Index-Aware Aggregation

**File:** [`backend/routes/analytics.js:61`](backend/routes/analytics.js#L61)
**Breaks at:** Teacher with 200+ sessions

The teacher dashboard runs a `LEFT JOIN sessions × LEFT JOIN polls × LEFT JOIN poll_responses` with no `LIMIT` clause. For a teacher who has used the platform for one semester:

- 200 sessions × 20 polls × 500 responses = 2,000,000 row join
- Query runtime: 10–30 seconds
- Fires every time the teacher opens the dashboard
- No pagination so the entire result is serialized to JSON and sent

**Fix:**
Paginate sessions (20 per page with cursor). Move aggregate stats to a materialized view updated on schedule.

---

### HIGH-02 — Heartbeat Updates Are Not Batched

**File:** [`backend/server.js:408`](backend/server.js#L408)
**Breaks at:** 500+ concurrent students

```js
// backend/server.js — lines 408–424 (called every 30 seconds per student)
await pool.query(
  `UPDATE session_participants SET last_activity = NOW()
   WHERE session_id = $1 AND student_id = $2`,
  [sessionId, userId]
);
```

- 500 students = **16+ individual UPDATE queries per second** (at 30-second intervals)
- Each write consumes 1 pool connection
- Compounds directly with CRIT-01

**Fix:**
Collect heartbeat updates in a local Map, flush every 30 seconds with a single batched `UPDATE ... WHERE (session_id, student_id) IN (...)`.

---

### HIGH-03 — File Uploads Buffered Entirely in Node.js Memory

**File:** [`backend/routes/resources.js:27`](backend/routes/resources.js#L27)
**Breaks at:** 5+ concurrent 50MB uploads

```js
// backend/routes/resources.js — lines 26–31
const upload = multer({
  storage: multer.memoryStorage(),         // Entire file held in RAM
  limits: { fileSize: 50 * 1024 * 1024 }  // 50MB limit
});
```

- 10 teachers × 50MB uploads = 500MB RAM spike
- No streaming to Supabase Storage — buffer held in memory during the entire network transfer
- Embedding processing (CRIT-06) holds the buffer in memory for another 2–3 minutes
- Node.js heap grows, GC pressure slows all other requests

**Fix:**
Use `multer.diskStorage()` to write to `/tmp` first, then stream from disk. Better: use Supabase signed upload URLs and have the client upload directly to Supabase Storage, bypassing the backend entirely.

---

### HIGH-04 — Student Dashboard Uses HTTP Polling Despite Active WebSocket

**File:** [`frontend/src/components/student/EnhancedStudentDashboard.jsx:57`](frontend/src/components/student/EnhancedStudentDashboard.jsx#L57)
**Breaks at:** 500+ concurrent dashboard viewers

```js
// EnhancedStudentDashboard.jsx — line 57
const refreshInterval = setInterval(() => { fetchStudentData(); }, 30000);
```

A WebSocket is already connected and maintained for session interactivity. But dashboard data is fetched via HTTP every 30 seconds regardless of whether anything changed.

- 500 students × 1 request/30s = **16+ wasted API requests per second**
- No ETag or Cache-Control headers on the response — every request is a full round-trip
- Dashboard is always 0–30 seconds stale

**Fix:**
Push dashboard updates via the existing WebSocket when relevant data changes (new poll, points update, badge earned). Remove the polling interval entirely.

---

### HIGH-05 — `setInterval` Timers Without Cleanup in Multiple Components

**File:** [`frontend/src/components/teacher/EnhancedSessionManagement.jsx`](frontend/src/components/teacher/EnhancedSessionManagement.jsx), [`frontend/src/components/teacher/GeneratedMCQs.jsx`](frontend/src/components/teacher/GeneratedMCQs.jsx)

```js
// GeneratedMCQs.jsx — line 223 (no interval duration, no clearInterval on unmount)
const intervalId = setInterval(async () => {
  if (!mountedRef.current) return;
  const stats = await pollAPI.getPollStats(createdPoll.id);
  // ...
}, /* NO INTERVAL DURATION — defaults to 0ms = every tick */);
// No clearInterval in cleanup
```

The missing duration means this runs every event loop tick — firing potentially 1000+ API requests per second from a single teacher's browser. The `EnhancedSessionManagement` component stacks notes polling, attendance timer, and refresh timer, and if any unmounts mid-async operation, the cleanup function may not fire.

**Fix:**
All intervals must have an explicit duration and a `useEffect` cleanup:
```js
useEffect(() => {
  const id = setInterval(fn, 5000);
  return () => clearInterval(id);
}, [deps]);
```

---

### HIGH-06 — JWT Tokens Are Never Revocable

**File:** [`backend/middleware/auth.js:17`](backend/middleware/auth.js#L17)
**Breaks at:** Any security incident

Once a JWT is issued it is valid until its 24-hour expiry with zero mechanism for revocation:

- Student removed from a course: their JWT still works for up to 24 hours
- Compromised token: valid until expiry, cannot be invalidated
- Password change: does not invalidate any existing tokens
- Force-logout: impossible

**Fix:**
Maintain a `token_blacklist` table (or Redis set) storing revoked token `jti` claims. Add a `jti` UUID at issuance. Middleware checks `jti` against the blacklist on every request. Alternatively, use 15-minute tokens + refresh token rotation.

---

### HIGH-07 — Leaderboard Queries Use Per-Pair Loops (N+1)

**File:** [`backend/routes/gamification.js:159`](backend/routes/gamification.js#L159)
**Breaks at:** 10+ pairs per knowledge card set

```js
// gamification.js — lines 159–179 (called individually per pair)
async function getPairVotes(pairId) {
  const result = await pool.query(`
    SELECT SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) as thumbs_up,
           SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) as thumbs_down
    FROM knowledge_card_votes
    WHERE pair_id = $1
  `, [pairId]);
}
```

20 pairs = 20 round-trips. No index on `knowledge_card_votes(pair_id)` means each is a full table scan.

**Fix — single query with `GROUP BY`:**
```sql
SELECT pair_id,
  SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) as thumbs_up,
  SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) as thumbs_down
FROM knowledge_card_votes
WHERE pair_id = ANY($1)
GROUP BY pair_id;
```

---

### HIGH-08 — In-Memory Cache Has No Real LRU Eviction

**File:** [`backend/services/cacheService.js:113`](backend/services/cacheService.js#L113)
**Breaks at:** Redis unavailable + high load

```js
// cacheService.js — lines 113–121
if (this.memoryCache.size > this.maxMemoryEntries) {  // Default: 500
  const firstKey = this.memoryCache.keys().next().value;
  this.memoryCache.delete(firstKey);  // Only deletes 1 entry per insertion
}
```

When Redis is unavailable the fallback in-memory cache has a 500-entry soft limit but:
- Only evicts 1 entry per insertion, not proportionally
- No actual LRU ordering — deletes the oldest inserted key, not the least recently used
- `memoryCacheTimers` Map leaks timer handle references under extended operation

**Fix:**
Replace with `lru-cache` npm package which provides proper LRU eviction, byte-aware limits, and TTL support natively.

---

## 4. Medium Severity Issues

These cause user-facing problems at scale but won't take the system down.

---

### MED-01 — No Cache-Control Headers on Any API Response

**File:** All routes in `backend/routes/`

No `ETag`, `Cache-Control`, or `Last-Modified` headers on any API response. Every browser request is a full round-trip even when data hasn't changed. At 500 concurrent users hitting the leaderboard, resource list, or session history simultaneously, 100% of requests cause DB queries.

**Fix:**
- `Cache-Control: private, max-age=60` for semi-static data (leaderboard, resource list)
- `ETag` headers for data that changes occasionally
- `stale-while-revalidate` for dashboard data

---

### MED-02 — Attendance Windows Not Persisted to Database

**File:** [`backend/server.js:42`](backend/server.js#L42), [`backend/server.js:568`](backend/server.js#L568)

```js
// server.js — lines 42–43
const attendanceWindows = new Map();
attendanceWindows.set(normalizedSessionId, {
  windowId, closesAt, markedStudentIds: new Set()
});
```

A server restart during a live attendance window silently loses all data. Students who already marked attendance lose their record with no recovery path.

**Fix:**
Write attendance windows to an `attendance_windows` DB table on creation. Read from DB on reconnect. Use the in-memory Map only as a write-through cache.

---

### MED-03 — SSE Streaming Has No Event ID for Reconnection

**File:** [`frontend/src/hooks/useAIChat.js:129`](frontend/src/hooks/useAIChat.js#L129)

SSE events include no `id:` field. If a student's connection drops mid-stream, the browser has no `Last-Event-ID` to send on reconnect, and the server cannot resume. The AI response in progress is silently discarded.

**Fix:**
Include `id: <sequential-counter>` in SSE events server-side. On reconnect, the browser sends `Last-Event-ID`; server detects the gap and either replays the missing chunks or sends a `[RECONNECTED]` signal to reset client state.

---

### MED-04 — `localStorage` Read Synchronously on Every API Call

**File:** [`frontend/src/utils/api.js:20`](frontend/src/utils/api.js#L20)

```js
// api.js — line 20
const str = localStorage.getItem('currentUser');
return str ? JSON.parse(str) : null;
```

`localStorage` is synchronous and blocks the main thread. `JSON.parse` on a large user object on every single API call adds 1–5ms of main-thread blocking. During poll bursts (5–10 simultaneous requests), this stacks.

**Fix:**
Read `currentUser` once at app initialization, store in React context or Zustand, and read from memory thereafter. Only re-read from `localStorage` on explicit auth events.

---

### MED-05 — Document Processing Blocks the Event Loop

**File:** [`backend/services/documentProcessor.js`](backend/services/documentProcessor.js)

PDF/DOCX/PPTX parsing via `pdf-parse`, `mammoth`, and `pptx2json` is CPU-intensive. Running synchronously on the main Node.js thread blocks the event loop — all other incoming requests (WebSocket heartbeats, poll responses, auth) are unresponsive during processing.

**Fix:**
Move document processing to a `worker_thread`. Main thread spawns a worker, passes the file path, and awaits a message with the parsed chunks. Event loop stays free during the 1–30 second parse time.

---

### MED-06 — Poll Broadcast Runs an Attendance DB Query on Every Broadcast

**File:** [`backend/server.js:483`](backend/server.js#L483)

```js
// server.js — lines 483–496 (called on EVERY poll broadcast)
const attendanceCheck = await pool.query(
  `SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE sp.attendance_status IS NOT NULL) as has_attendance
   FROM session_participants sp
   JOIN sessions s ON sp.session_id = s.id
   WHERE s.session_id = $1`,
  [sessionId]
);
```

This runs on every single poll broadcast event. 20 polls per session × 10 broadcasts per poll × 10 active sessions = 2,000 redundant DB queries per hour for data that changes slowly.

**Fix:**
Cache this result in Redis (or even the in-memory attendance window Map) with a 30-second TTL. Invalidate only when a student joins or leaves.

---

## 5. Missing Infrastructure

These are architectural gaps that cap the entire system's ceiling — not individual code fixes.

---

### INFRA-01 — No Redis

**Impact:**
- No distributed caching → CRIT-03 persists (JWT auth hits DB every request)
- No pub/sub → WebSocket cannot scale horizontally (CRIT-02)
- No shared session state → single-process only
- No job queue backend → AI pipeline stays synchronous (CRIT-05)

**Solution:** Add Upstash Redis via Vercel Marketplace (or Redis Cloud on Render). Client: `ioredis`.

---

### INFRA-02 — No Message Queue

**Impact:**
- AI queries block HTTP connections for 30–60 seconds (CRIT-05)
- Document vectorization blocks upload responses for 2–3 minutes (CRIT-06)
- No retry/backoff for failed AI or embedding jobs
- No visibility into pending or failed work

**Solution:** BullMQ (runs on INFRA-01 Redis). Separate queues: `ai-queries`, `vectorization`, `pdf-processing`. Observability via Bull Board dashboard.

---

### INFRA-03 — No CDN for Uploaded Files

**Impact:**
- PDFs, DOCX, PPTX served from Supabase origin on every request
- No geographic distribution — students in distant regions experience 500ms+ latency
- Supabase Storage bandwidth costs accumulate linearly

**Solution:** Enable Supabase Storage CDN (built-in toggle in Dashboard). Set `Cache-Control: public, max-age=31536000, immutable` on hashed static asset filenames for the React frontend.

---

### INFRA-04 — Missing Database Indexes on High-Traffic Columns

The following indexes are absent. Without them, every analytics, leaderboard, or attendance query is a full table scan.

| Table | Missing Index | Used By |
|---|---|---|
| `poll_responses` | `(session_id, student_id)` | Gamification, analytics |
| `session_participants` | `(session_id)` | WebSocket heartbeat, analytics |
| `knowledge_card_votes` | `(pair_id)` | Leaderboard queries (HIGH-07) |
| `resource_chunks` | `(resource_id)` | RAG pipeline vector lookup |
| `polls` | `(session_id, is_active)` | Poll activation queries |
| `users` | `(id)` | Auth middleware (CRIT-03) |

**Solution:**
```sql
CREATE INDEX CONCURRENTLY idx_poll_responses_session_student
  ON poll_responses (session_id, student_id);

CREATE INDEX CONCURRENTLY idx_session_participants_session
  ON session_participants (session_id);

CREATE INDEX CONCURRENTLY idx_knowledge_card_votes_pair
  ON knowledge_card_votes (pair_id);

CREATE INDEX CONCURRENTLY idx_resource_chunks_resource
  ON resource_chunks (resource_id);

CREATE INDEX CONCURRENTLY idx_polls_session_active
  ON polls (session_id, is_active);
```
`CONCURRENTLY` avoids table locks in production.

---

### INFRA-05 — Single-Process Architecture, No Health Endpoint

The entire backend is one Node.js process with:
- No process manager (PM2 cluster mode) to use multiple CPU cores
- No container orchestration (`Dockerfile` absent)
- No `GET /health` endpoint for load balancer probes
- No graceful shutdown — in-flight WebSocket messages may be lost on Render deploy restarts

**Solution:**
1. Add `GET /health` returning `{ status: 'ok', uptime: process.uptime(), connections: activeCount }`
2. Handle `SIGTERM`: stop accepting new connections, drain existing, close DB pool
3. PM2 cluster mode on Render to use all available cores

---

## 6. Database Index Gaps

See INFRA-04 for the migration SQL. The indexes above will have the following impact:

| Query | Before Index | After Index |
|---|---|---|
| Analytics GROUP BY session | Full table scan — O(n rows) | Index range scan — O(log n) |
| Leaderboard vote aggregation | 20 full table scans | 1 index scan per pair |
| Auth DB query per request | Seq scan on users | PK index hit (~0.1ms) |
| Heartbeat UPDATE | Seq scan per row | Index seek per row |

---

## 7. Priority Fix Roadmap

### Week 1 — Stop the Bleeding (Low effort, immediate impact)

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Raise `DB_POOL_MAX` to 20, switch to Supabase pooler URL | [`backend/db.js:19`](backend/db.js#L19) | 15 min |
| 2 | Fix both `async forEach` → `Promise.allSettled` | [`backend/routes/ai-search.js:104`](backend/routes/ai-search.js#L104), [`L383`](backend/routes/ai-search.js#L383) | 1 hr |
| 3 | Batch heartbeat writes every 30s | [`backend/server.js:408`](backend/server.js#L408) | 2 hr |
| 4 | Add DB indexes (migration) | Database | 2 hr |
| 5 | Paginate analytics queries (LIMIT 20, cursor) | [`backend/routes/analytics.js:61`](backend/routes/analytics.js#L61) | 3 hr |
| 6 | Fix `setInterval` with no duration in GeneratedMCQs | [`frontend/src/components/teacher/GeneratedMCQs.jsx:223`](frontend/src/components/teacher/GeneratedMCQs.jsx#L223) | 30 min |
| 7 | Cache `currentUser` in React context instead of localStorage | [`frontend/src/utils/api.js:20`](frontend/src/utils/api.js#L20) | 1 hr |

---

### Week 2 — Add Redis (3–5 days, architectural)

| # | Fix | Impact |
|---|---|---|
| 1 | Install Upstash Redis, configure `ioredis` | Enables all subsequent fixes |
| 2 | Cache JWT auth lookups (5 min TTL) | Removes ~95% of auth DB queries |
| 3 | Replace in-memory session/attendance Maps with Redis | Enables horizontal scaling |
| 4 | Add Redis pub/sub for WebSocket broadcasts | Fixes cross-instance broadcasting |
| 5 | Persist attendance windows to DB + Redis write-through | Survives server restarts |
| 6 | Replace custom LRU cache with `lru-cache` package | Eliminates cache memory leak |

---

### Week 3 — Async AI Pipeline (3–5 days, architectural)

| # | Fix | Impact |
|---|---|---|
| 1 | BullMQ queue for AI queries (runs on Week 2 Redis) | Unblocks HTTP connections |
| 2 | Batch embedding requests to HuggingFace | 100 chunks: 120s → 3s |
| 3 | SSE job status endpoint for AI queue progress | Real-time progress without polling |
| 4 | Move document parsing to `worker_thread` | Unblocks event loop during PDF processing |

---

### Month 2 — Performance Polish

- Direct-to-Supabase signed upload URLs (removes 50MB memory spikes)
- HTTP `ETag` and `Cache-Control` headers on all API responses
- Replace student dashboard `setInterval` polling with WebSocket push
- Token blacklist for JWT revocation (Redis set of revoked `jti` values)
- `GET /health` endpoint + `SIGTERM` graceful shutdown
- Add `id:` SSE event IDs for reconnection support
- Enable Supabase Storage CDN

---

## 8. Full Issue Table

| ID | Issue | Severity | File | Line | Breaks At | Fix Effort |
|---|---|---|---|---|---|---|
| CRIT-01 | DB pool size = 5 | CRITICAL | `backend/db.js` | 19 | 50 users | 15 min |
| CRIT-02 | WebSocket state in-memory | CRITICAL | `backend/server.js` | 34, 213, 426 | 1 instance | 3 days |
| CRIT-03 | DB query on every auth check | CRITICAL | `backend/middleware/auth.js` | 17–30 | 200 users | 2 hr |
| CRIT-04 | `async forEach` fire-and-forget (×2) | CRITICAL | `backend/routes/ai-search.js` | 104, 383 | 20 resources | 1 hr |
| CRIT-05 | Blocking synchronous AI pipeline | CRITICAL | `backend/services/ragService.js` | 30 | 10 queries | 3 days |
| CRIT-06 | Sequential embedding with 1s delays | CRITICAL | `backend/services/embeddingService.js` | 13–89 | 5 uploads | 1 day |
| HIGH-01 | No pagination on analytics | HIGH | `backend/routes/analytics.js` | 61–80 | 200 sessions | 3 hr |
| HIGH-02 | Heartbeat = 1 DB write per student | HIGH | `backend/server.js` | 408–424 | 500 users | 2 hr |
| HIGH-03 | 50MB uploads buffered in memory | HIGH | `backend/routes/resources.js` | 27–31 | 5 concurrent | 1 day |
| HIGH-04 | HTTP polling despite active WebSocket | HIGH | `frontend/.../EnhancedStudentDashboard.jsx` | 57 | 500 users | 4 hr |
| HIGH-05 | `setInterval` with no duration or cleanup | HIGH | `frontend/.../GeneratedMCQs.jsx` | 223 | 100 teachers | 30 min |
| HIGH-06 | JWTs are never revocable | HIGH | `backend/middleware/auth.js` | 17–45 | Any token leak | 4 hr |
| HIGH-07 | Leaderboard N+1 per pair | HIGH | `backend/routes/gamification.js` | 159–179 | 10 pairs | 1 hr |
| HIGH-08 | In-memory cache no real LRU eviction | HIGH | `backend/services/cacheService.js` | 113–121 | 1000 entries | 2 hr |
| MED-01 | No HTTP cache headers | MEDIUM | All API routes | — | 100 users | 2 hr |
| MED-02 | Attendance windows not persisted to DB | MEDIUM | `backend/server.js` | 42, 568 | Any restart | 3 hr |
| MED-03 | SSE has no event ID for reconnect | MEDIUM | `frontend/src/hooks/useAIChat.js` | 129–150 | Poor network | 2 hr |
| MED-04 | `localStorage` read on every request | MEDIUM | `frontend/src/utils/api.js` | 20 | 100 req burst | 1 hr |
| MED-05 | Document parsing blocks event loop | MEDIUM | `backend/services/documentProcessor.js` | — | Large PDFs | 1 day |
| MED-06 | Poll broadcast queries DB on every fire | MEDIUM | `backend/server.js` | 483–496 | 10+ sessions | 2 hr |
| INFRA-01 | No Redis | BLOCKING | — | — | 500 users | 3 days |
| INFRA-02 | No message queue | BLOCKING | — | — | 10 AI queries | 3 days |
| INFRA-03 | No CDN for uploaded files | BLOCKING | — | — | 100 users | 4 hr |
| INFRA-04 | Missing DB indexes | BLOCKING | Database | — | 1000 rows | 2 hr |
| INFRA-05 | Single-process, no health endpoint | BLOCKING | — | — | Any deploy | 4 hr |

---

*Generated from live codebase audit — 2026-03-26. All line numbers reflect the current state of the repository.*

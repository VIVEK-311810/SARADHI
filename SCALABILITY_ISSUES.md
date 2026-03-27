# SAS Edu AI — Scalability Issues Report

> **Date:** 2026-03-26
> **Scope:** Full codebase audit — `SAS-EDU-AI_F/` (React frontend) + `sas_b/` (Express backend)
> **Purpose:** Identify bottlenecks before the platform is rolled out to SASTRA University at scale

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Severity Issues](#high-severity-issues)
3. [Medium Severity Issues](#medium-severity-issues)
4. [Missing Infrastructure](#missing-infrastructure)
5. [Priority Fix Roadmap](#priority-fix-roadmap)
6. [Full Issue Summary Table](#full-issue-summary-table)

---

## Critical Issues

These will cause outright failures or complete system unavailability under real classroom load.

---

### CRIT-01 — Database Connection Pool Capped at 5

**File:** `sas_b/db.js` line 19
**Breaks at:** ~50 concurrent users

```js
max: parseInt(process.env.DB_POOL_MAX) || 5,
```

**What happens:**
Every authenticated request consumes a connection for auth verification, query, and cleanup. With a single classroom of 60 students submitting poll responses simultaneously, all 5 connections are saturated. New requests queue indefinitely, then timeout with a 503. The problem is compounded because Supabase free-tier limits the actual server-side connections to 6–15 depending on plan — meaning even if you raise the pool size, you're still constrained at the Supabase level.

**Impact:**
- Requests timeout under normal classroom load
- DB errors cascade to every route simultaneously
- 10-second idle timeout means connections drop under burst traffic

**Fix:**
Raise `DB_POOL_MAX` to at least 20 for dev, and use PgBouncer (Supabase's built-in transaction-mode pooler) in production. Connect via the pooler URL, not the direct DB URL.

---

### CRIT-02 — WebSocket Session State Stored In-Memory

**File:** `sas_b/server.js` lines 34, 213–217, 426–436
**Breaks at:** Any horizontal scaling attempt; data loss on restart

```js
const sessionConnections = new Map();       // line 34
const dashboardConnections = new Map();
const attendanceWindows = new Map();

// Broadcasting to all students in session
connections.forEach(ws => {
  if (ws.readyState === WebSocket.OPEN) ws.send(payload);
});
```

**What happens:**
All live WebSocket connections, session membership, and attendance windows are stored in process memory. This means:

1. **No horizontal scaling** — if you run 2 Node instances behind a load balancer, a teacher on instance A broadcasts a poll and students on instance B never receive it. Each instance has its own disconnected Map.
2. **No crash recovery** — server restart during a live class = every student silently disconnected, attendance windows gone, active polls lost. There is no recovery path.
3. **Memory growth** — 1000+ concurrent WebSocket connections with no eviction. Each connection holds socket buffers, message queues, and metadata.
4. **Synchronous broadcast loop** — `connections.forEach` is synchronous. If one client's `ws.send()` is slow or blocks, it delays the entire broadcast to all other students.

**Fix:**
Introduce Redis with `ioredis` for pub/sub. Each instance subscribes to session channels. Broadcasts publish to a Redis channel; all instances receive and forward to their local connections. Attendance windows and session state move to the database.

---

### CRIT-03 — JWT Auth Performs a Database Query on Every Request

**File:** `sas_b/middleware/auth.js` lines 17–30
**Breaks at:** 200+ concurrent users

```js
const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
```

**What happens:**
JWT verification is CPU-only and fast. But then a full `SELECT * FROM users` is executed on every single authenticated request. User data (role, email, name) does not change mid-session. This query is entirely redundant.

- 200 students each making 1 request/sec = 200 unnecessary DB round-trips per second
- Each round-trip consumes 1 connection from the pool of 5 (see CRIT-01)
- In a poll-response burst, all students hit simultaneously — 200 queries in < 1 second

**Fix:**
Cache decoded user objects in Redis with a 5-minute TTL, keyed by `userId`. First request hits the DB, subsequent requests within 5 minutes read from cache. This reduces auth DB load by ~95%.

---

### CRIT-04 — `async forEach` Fire-and-Forget Logging

**File:** `sas_b/routes/ai-search.js` lines 104–115
**Breaks at:** 20+ resources per AI query

```js
resources.forEach(async (resource) => {   // NOT awaited — floating promises
  await supabase
    .from('resource_access_logs')
    .insert({ resource_id: resource.id, ... })
    .catch(err => logger.warn(...));
});
res.json(data);  // Returns immediately — 50 queries still pending
```

**What happens:**
`Array.prototype.forEach` does not await async callbacks. Each insert fires immediately without waiting. The response returns to the client before any logging completes. Problems:

1. **Silent failures** — if Supabase connection is under pressure, inserts fail silently
2. **Memory leak** — each pending Promise holds references to resource data until resolved
3. **Race conditions** — logs may arrive in any order, making analytics unreliable
4. **Supabase connection flooding** — 50 resources = 50 simultaneous inserts hitting an already-constrained connection limit

**Fix:**
```js
await Promise.allSettled(
  resources.map(resource =>
    supabase.from('resource_access_logs').insert({ resource_id: resource.id, ... })
  )
);
```

Or better: batch all inserts into a single `INSERT ... VALUES ($1,$2), ($3,$4), ...` query.

---

### CRIT-05 — AI Pipeline Is Fully Synchronous, No Queue

**File:** `sas_b/services/ragService.js` line 30, `sas_b/routes/ai-assistant.js` lines 154–156
**Breaks at:** 10+ concurrent AI queries

```js
// Each student query blocks for 30-60 seconds waiting on LLM
const result = await mistralClient.chatComplete(this.model, messages, { maxTokens });
```

**What happens:**
Every student AI question holds an open HTTP connection while waiting for the Mistral LLM response (typically 30–60 seconds). There is no queue, no backpressure, no task scheduling. The `RequestQueue` class does limit to 5 concurrent — but this means the 6th request blocks indefinitely rather than being queued gracefully.

- 50 students in a session each clicking "Ask AI" = 50 open HTTP connections
- HuggingFace rate-limits at some threshold — when hit, all 50 fail simultaneously (thundering herd)
- Render's free/hobby tier has a 30-second function timeout — LLM responses often exceed this

**Fix:**
Introduce a job queue (BullMQ + Redis). Student submits query → job added to queue → immediate `202 Accepted` response with job ID. Student polls for result via SSE or WebSocket. Background worker processes jobs at a controlled concurrency rate.

---

### CRIT-06 — Embedding Generation Is Sequential with Forced 1-Second Delays

**File:** `sas_b/services/embeddingService.js` lines 10–25, 65–88
**Breaks at:** 5+ concurrent document uploads

```js
this.minRequestInterval = 1000;  // 1 second minimum between requests

for (let i = 0; i < texts.length; i++) {
  const embedding = await this.generateEmbedding(texts[i]);  // awaited one by one
  await this.sleep(100);
}
```

**What happens:**
Document vectorization processes chunks one at a time with enforced 1-second gaps. A 100-page PDF typically produces 80–120 chunks:

- 100 chunks × (1000ms delay + embedding time + 100ms sleep) ≈ **2–3 minutes minimum**
- The upload HTTP response is held open during this entire process
- 5 teachers uploading simultaneously = 5 × 2 minutes of blocked event loop operations
- No batching to HuggingFace — HuggingFace's `feature-extraction` endpoint accepts arrays

**Fix:**
Use HuggingFace's batch embedding endpoint. Send all chunks in one request (or in batches of 32–64). This reduces 100 chunks from 2+ minutes to ~3 seconds.

---

## High Severity Issues

These cause significant performance degradation as student/teacher count grows.

---

### HIGH-01 — Analytics Queries Have No Pagination or Index-Aware Aggregation

**File:** `sas_b/routes/analytics.js` lines 61–80
**Breaks at:** Teacher with 500+ polls

**What happens:**
Teacher dashboard fetches all sessions, all polls, all responses in a single aggregated query. No `LIMIT` on the outer query. `LEFT JOIN session_participants × LEFT JOIN poll_responses` without proper indexes creates a near-Cartesian product for heavily-used accounts.

- Teacher with 2 years of sessions: 500+ sessions, 5000+ polls, 500,000+ responses
- Query time: 10–30 seconds
- This query runs every time the dashboard loads

**Fix:**
Paginate sessions (20 per page). Move aggregate stats to a materialized view updated on a schedule. Add indexes on `poll_responses(session_id)`, `polls(session_id)`, `session_participants(session_id)`.

---

### HIGH-02 — Heartbeat Updates Are Not Batched

**File:** `sas_b/server.js` lines 408–424
**Breaks at:** 500+ concurrent students

```js
// Called every 30 seconds per student
await pool.query(
  `UPDATE session_participants SET last_activity = NOW() WHERE session_id = $1 AND student_id = $2`,
  [sessionId, userId]
);
```

**What happens:**
Each WebSocket heartbeat triggers an individual `UPDATE` statement. This is throttled to once per 30 seconds per student — but the math is still bad:

- 500 students = 500 individual updates every 30 seconds = **16+ DB writes/sec**
- Each write consumes 1 pool connection
- At peak (students joining simultaneously), all heartbeats fire at the same time

**Fix:**
Collect heartbeat updates in memory for 30 seconds, then flush in a single batch:
```sql
UPDATE session_participants SET last_activity = NOW()
WHERE (session_id, student_id) IN (($1,$2), ($3,$4), ...)
```

---

### HIGH-03 — File Uploads Buffered Entirely in Node.js Memory

**File:** `sas_b/routes/resources.js` lines 27–31
**Breaks at:** 5+ concurrent 50MB uploads

```js
storage: multer.memoryStorage(),
limits: { fileSize: 50 * 1024 * 1024 }  // 50MB
```

**What happens:**
The entire file is loaded into `Buffer` in Node.js memory before processing. With multiple concurrent uploads:

- 10 teachers × 50MB = 500MB RAM spike
- Node's heap grows, GC pressure increases, other requests slow
- No streaming to Supabase storage — buffer held in memory during network transfer
- During vectorization (2–3 min per file), buffer stays in memory

**Fix:**
Use `multer.diskStorage()` to write to `/tmp` first, then stream from disk to Supabase. Alternatively, use signed upload URLs and have the client upload directly to Supabase Storage, bypassing the backend entirely.

---

### HIGH-04 — Student Dashboard Uses HTTP Polling Despite Active WebSocket

**File:** `SAS-EDU-AI_F/src/components/student/EnhancedStudentDashboard.jsx` line 57
**Breaks at:** 500+ concurrent dashboard viewers

```js
const refreshInterval = setInterval(() => { fetchStudentData(); }, 30000);
```

**What happens:**
A WebSocket connection is already maintained for session interactivity. But the student dashboard fetches its data via HTTP polling every 30 seconds regardless of whether anything changed.

- 500 students × 1 request/30s = **16+ wasted API requests per second**
- Responses are usually identical (no new data) — 100% cache-miss rate because no ETags or cache headers
- Dashboard is always 0–30 seconds stale

**Fix:**
Push dashboard updates via the existing WebSocket when relevant data changes (new poll, points update, badge earned). This reduces polling load to zero and makes updates instant.

---

### HIGH-05 — Multiple `setInterval` Timers Without Guaranteed Cleanup

**File:** `SAS-EDU-AI_F/src/components/teacher/EnhancedSessionManagement.jsx`
**Breaks at:** 100+ teachers in concurrent sessions

**What happens:**
Multiple intervals are started per component mount — notes polling, attendance timers, refresh timers. If a component unmounts during an async operation, cleanup functions may not execute before the next tick fires. This is a classic React memory leak.

- Stale closure captures old state in interval callbacks
- `setState` calls on unmounted components generate console errors in dev but silent bugs in prod
- Each leaked interval continues firing until page reload

**Fix:**
All intervals must be stored in a `ref` and cleared in the `useEffect` cleanup function. Pattern:
```js
useEffect(() => {
  const id = setInterval(fn, delay);
  return () => clearInterval(id);
}, [deps]);
```

---

### HIGH-06 — JWT Tokens Are Never Invalidatable

**File:** `sas_b/middleware/auth.js` lines 17–45
**Breaks at:** Any security incident

**What happens:**
Once a JWT is issued, it is valid until its expiry timestamp with no mechanism to revoke it. There is no token blacklist, no session table, no revocation check.

- Student removed from a course: their JWT still works until expiry (24 hours)
- Leaked token: valid indefinitely until expiry
- Cannot force-logout a user from all devices
- Password change does not invalidate existing tokens

**Fix:**
Maintain a `token_blacklist` table (or Redis set) storing revoked token JTIs. Add a `jti` (JWT ID) claim at issuance. Middleware checks `jti` against the blacklist. Alternatively, use shorter-lived tokens (15 min) + refresh token rotation.

---

### HIGH-07 — Leaderboard Queries Use Per-Pair Loops

**File:** `sas_b/routes/gamification.js` lines 159–179
**Breaks at:** 10+ pairs per knowledge card set

```js
// Called individually for each pair
async function getPairVotes(pairId) {
  const result = await pool.query(`
    SELECT SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) as thumbs_up ...
    FROM knowledge_card_votes WHERE pair_id = $1
  `, [pairId]);
}
```

**What happens:**
Each pair triggers a separate DB query. 20 pairs = 20 round-trips. With no index on `knowledge_card_votes(pair_id)`, each query is a full table scan.

**Fix:**
Single query with `GROUP BY`:
```sql
SELECT pair_id,
  SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) as thumbs_up,
  SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) as thumbs_down
FROM knowledge_card_votes
WHERE pair_id = ANY($1)
GROUP BY pair_id;
```

---

### HIGH-08 — In-Memory Cache Has No Reliable TTL Enforcement

**File:** `sas_b/services/cacheService.js` lines 98–115
**Breaks at:** 1000+ cache entries

**What happens:**
The fallback in-memory cache uses `setTimeout` for TTL expiration. When Redis is unavailable, this in-memory cache has a `maxMemoryEntries = 500` soft limit but no actual LRU eviction. The `memoryCacheTimers` Map leaks references to timer handles. Under extended operation, this grows unbounded.

**Fix:**
Replace hand-rolled cache with a proper LRU cache library (`lru-cache`) that enforces entry count and byte limits natively, with TTL support.

---

## Medium Severity Issues

These cause user-facing problems at scale but won't take the system down.

---

### MED-01 — No Cache-Control Headers on API Responses

**File:** `sas_b/routes/resources.js`, all API routes

No HTTP caching headers (`ETag`, `Cache-Control`, `Last-Modified`) on any API response. Browsers always make full requests for data that may not have changed. At 500 concurrent users, this wastes significant bandwidth and backend compute.

**Fix:**
Add `Cache-Control: private, max-age=60` for semi-static data (leaderboard, resource list). Use `ETag` headers for data that changes occasionally. Implement stale-while-revalidate for dashboard data.

---

### MED-02 — Attendance Windows Not Persisted to Database

**File:** `sas_b/server.js` lines 42–43, 568–572

```js
const attendanceWindows = new Map();
attendanceWindows.set(normalizedSessionId, {
  windowId, closesAt, markedStudentIds: new Set()
});
```

A server restart during a live attendance window silently loses all data. Students who already marked attendance lose their record. The teacher has no way to recover.

**Fix:**
Write attendance windows to a `attendance_windows` database table on creation. Read from DB on reconnect. Use the in-memory Map only as a write-through cache.

---

### MED-03 — SSE Streaming Has No Event ID for Reconnection

**File:** `SAS-EDU-AI_F/src/hooks/useAIChat.js` lines 129–150

SSE events do not include `id:` fields. If a student's connection drops mid-stream and reconnects, the browser has no `Last-Event-ID` to send, and the server cannot resume from where it left off. The response is silently lost.

**Fix:**
Include `id: <sequential-counter>` in SSE events server-side. On reconnect, the browser sends `Last-Event-ID` header. Server can detect the gap and either replay or send a `[RECONNECTED]` signal to reset client state cleanly.

---

### MED-04 — `localStorage` Read Synchronously on Every Request

**File:** `SAS-EDU-AI_F/src/utils/api.js` line 20

```js
const str = localStorage.getItem('currentUser');
return str ? JSON.parse(str) : null;
```

`localStorage` is synchronous and blocks the main thread. `JSON.parse` on a large user object (with role metadata, permissions, etc.) on every API call adds 1–5ms of main-thread blocking per call. This accumulates during poll bursts where the frontend fires 5–10 requests simultaneously.

**Fix:**
Read `currentUser` once at app initialization, store in React context or Zustand, and read from memory thereafter. Only re-read from localStorage on explicit refresh or auth events.

---

### MED-05 — Document Processing Blocks the Event Loop

**File:** `sas_b/services/documentProcessor.js`

PDF/DOCX/PPTX parsing is CPU-intensive. Running this synchronously on the main Node.js thread blocks the event loop, making all other requests unresponsive during processing.

**Fix:**
Move document processing to a `worker_thread`. The main thread spawns a worker, passes the file buffer, and awaits a message with the parsed chunks. Event loop stays free during processing.

---

### MED-06 — No Request Deduplication for Identical Concurrent Queries

**File:** All API routes

If 200 students join a session simultaneously and all request the same resource list at the same time, 200 identical DB queries execute. There is no mechanism to coalesce these into one query with a shared result.

**Fix:**
Use a request-level "promise coalescing" pattern. Cache in-flight promises keyed by query signature for 500ms. Subsequent identical requests within that window receive the same promise. Result is shared when the first query resolves.

---

## Missing Infrastructure

These are not individual code fixes — they are architectural gaps that cap the entire system's ceiling.

---

### INFRA-01 — No Redis

**Impact:**
- No distributed caching → JWT auth hits DB on every request (CRIT-03)
- No pub/sub → WebSocket cannot scale horizontally (CRIT-02)
- No shared session state → horizontal scaling impossible
- No job queue backend → AI pipeline cannot be made async (CRIT-05)

**Solution:** Add Upstash Redis via Vercel Marketplace (or Redis Cloud on Render). Use `ioredis` client.

---

### INFRA-02 — No Message Queue

**Impact:**
- AI queries block HTTP connections for 30–60 seconds (CRIT-05)
- Document vectorization blocks upload responses for 2–3 minutes (CRIT-06)
- No retry/backoff for failed AI or embedding jobs
- No visibility into pending work

**Solution:** BullMQ (runs on Redis from INFRA-01). Separate queues for: `ai-queries`, `vectorization`, `pdf-processing`. Dashboard via Bull Board for observability.

---

### INFRA-03 — No CDN for Static Assets and Uploaded Files

**Impact:**
- PDFs, DOCX, PPTX served from Supabase origin on every request
- No geographic distribution — students in different regions experience high latency
- Supabase Storage bandwidth costs accumulate

**Solution:** Enable Supabase Storage CDN (built-in, just needs to be toggled). For the React frontend on Vercel, static assets are already CDN-distributed — ensure `Cache-Control: public, max-age=31536000, immutable` is set for hashed asset filenames.

---

### INFRA-04 — No Database Indexes on High-Traffic Columns

Missing indexes identified:

| Table | Column(s) | Used By |
|---|---|---|
| `poll_responses` | `(session_id, student_id)` | Gamification, analytics |
| `session_participants` | `(session_id)` | WebSocket heartbeat, analytics |
| `knowledge_card_votes` | `(pair_id)` | Leaderboard queries |
| `resource_chunks` | `(resource_id)` | RAG pipeline vector lookup |
| `polls` | `(session_id, is_active)` | Poll activation queries |

**Solution:** Add a database migration with `CREATE INDEX CONCURRENTLY` for each. `CONCURRENTLY` avoids table locks in production.

---

### INFRA-05 — Single-Process Architecture

The entire backend is a single Node.js process. There is no:
- Process manager (PM2, cluster mode) to use multiple CPU cores
- Container orchestration (no `Dockerfile`)
- Health check endpoint for load balancer probes
- Graceful shutdown handling (in-flight WebSocket messages may be lost on deploy)

**Solution:**
1. Add `GET /health` endpoint returning `{ status: 'ok', uptime: process.uptime() }`
2. Handle `SIGTERM` gracefully: stop accepting new connections, drain existing, close DB pool
3. Use PM2 cluster mode on Render to use all available CPU cores

---

## Priority Fix Roadmap

### Week 1 — Stop the Bleeding (Hours of work, huge impact)

| # | Fix | File | Effort |
|---|---|---|---|
| 1 | Raise `DB_POOL_MAX` to 20, switch to Supabase pooler URL | `sas_b/db.js` | 30 min |
| 2 | Fix `async forEach` → `Promise.allSettled` | `sas_b/routes/ai-search.js:104` | 1 hr |
| 3 | Batch heartbeat writes every 30s | `sas_b/server.js:408` | 2 hr |
| 4 | Add DB indexes (migration file) | Database | 2 hr |
| 5 | Paginate analytics queries | `sas_b/routes/analytics.js` | 3 hr |
| 6 | Fix `setInterval` cleanup in React components | `SAS-EDU-AI_F/src/components/teacher/` | 2 hr |

---

### Week 2 — Add Redis (3–5 days, architectural)

| # | Fix | Impact |
|---|---|---|
| 1 | Install Upstash Redis, configure `ioredis` | Enables all subsequent fixes |
| 2 | Cache JWT auth lookups (5 min TTL) | Removes 95% of auth DB queries |
| 3 | Replace in-memory session/attendance maps with Redis | Enables horizontal scaling |
| 4 | Add Redis pub/sub for WebSocket broadcasts | Fixes cross-instance broadcasting |
| 5 | Persist attendance windows to DB + Redis | Survives server restarts |

---

### Week 3 — Async AI Pipeline (3–5 days, architectural)

| # | Fix | Impact |
|---|---|---|
| 1 | Add BullMQ queue for AI queries | Unblocks HTTP connections |
| 2 | Worker pool for embedding generation | Parallel embedding, no 1s delays |
| 3 | SSE job status endpoint for frontend | Real-time AI progress without polling |
| 4 | Move document parsing to worker threads | Unblocks event loop |

---

### Month 2 — Performance Polish

- Direct-to-Supabase file uploads (signed URLs) — remove 50MB memory spikes
- HTTP `ETag` and `Cache-Control` headers on API responses
- Request deduplication / coalescing for high-traffic endpoints
- Replace student dashboard polling with WebSocket push
- Token blacklist for JWT revocation
- `GET /health` endpoint + graceful shutdown

---

## Full Issue Summary Table

| ID | Issue | Severity | File | Line | Breaks At | Fix Effort |
|---|---|---|---|---|---|---|
| CRIT-01 | DB pool size = 5 | CRITICAL | `sas_b/db.js` | 19 | 50 users | 30 min |
| CRIT-02 | WebSocket state in-memory | CRITICAL | `sas_b/server.js` | 34, 213, 426 | 1 instance | 3 days |
| CRIT-03 | DB query on every auth check | CRITICAL | `sas_b/middleware/auth.js` | 17–30 | 200 users | 2 hr |
| CRIT-04 | `async forEach` fire-and-forget | CRITICAL | `sas_b/routes/ai-search.js` | 104–115 | 20 resources | 1 hr |
| CRIT-05 | Blocking synchronous AI pipeline | CRITICAL | `sas_b/services/ragService.js` | 30 | 10 queries | 3 days |
| CRIT-06 | Sequential embedding, 1s delays | CRITICAL | `sas_b/services/embeddingService.js` | 10–88 | 5 uploads | 1 day |
| HIGH-01 | No pagination on analytics | HIGH | `sas_b/routes/analytics.js` | 61–80 | 500 polls | 3 hr |
| HIGH-02 | Heartbeat = 1 DB write per student | HIGH | `sas_b/server.js` | 408–424 | 500 users | 2 hr |
| HIGH-03 | 50MB uploads in Node memory | HIGH | `sas_b/routes/resources.js` | 27–31 | 5 concurrent | 1 day |
| HIGH-04 | HTTP polling despite active WebSocket | HIGH | `SAS-EDU-AI_F/.../EnhancedStudentDashboard.jsx` | 57 | 500 users | 4 hr |
| HIGH-05 | Leaked `setInterval` timers | HIGH | `SAS-EDU-AI_F/.../EnhancedSessionManagement.jsx` | multiple | 100 teachers | 2 hr |
| HIGH-06 | JWTs are never revocable | HIGH | `sas_b/middleware/auth.js` | 17–45 | Any token leak | 4 hr |
| HIGH-07 | Leaderboard N+1 per pair | HIGH | `sas_b/routes/gamification.js` | 159–179 | 10 pairs | 1 hr |
| HIGH-08 | Memory cache no real LRU eviction | HIGH | `sas_b/services/cacheService.js` | 98–115 | 1000 entries | 2 hr |
| MED-01 | No HTTP cache headers | MEDIUM | All API routes | — | 100 users | 2 hr |
| MED-02 | Attendance windows not persisted | MEDIUM | `sas_b/server.js` | 42, 568 | Any restart | 3 hr |
| MED-03 | SSE has no event ID for reconnect | MEDIUM | `SAS-EDU-AI_F/src/hooks/useAIChat.js` | 129–150 | Poor network | 2 hr |
| MED-04 | `localStorage` read blocks main thread | MEDIUM | `SAS-EDU-AI_F/src/utils/api.js` | 20 | 100 req burst | 1 hr |
| MED-05 | Document parsing blocks event loop | MEDIUM | `sas_b/services/documentProcessor.js` | — | Large PDFs | 1 day |
| MED-06 | No request deduplication | MEDIUM | All API routes | — | 200 burst | 1 day |
| INFRA-01 | No Redis | BLOCKING | — | — | 500 users | 3 days |
| INFRA-02 | No message queue | BLOCKING | — | — | 10 AI queries | 3 days |
| INFRA-03 | No CDN for uploads | BLOCKING | — | — | 100 users | 4 hr |
| INFRA-04 | Missing DB indexes | BLOCKING | Database | — | 1000 rows | 2 hr |
| INFRA-05 | Single-process, no health endpoint | BLOCKING | — | — | Any deploy | 4 hr |

---

*Generated by codebase audit on 2026-03-26. All line numbers reflect the state of the codebase at time of audit.*

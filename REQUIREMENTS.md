# SAS Edu AI — Functional & Non-Functional Requirements

> **Date:** 2026-03-26
> **Platform:** Live classroom engagement tool for SASTRA University
> **Sources:** CLAUDE.md · SCALABILITY_ISSUES.md · SCALABILITY_REPORT.md · REDesign PLan.md · LEARNING_RESOURCES.md · full codebase audit

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles](#2-user-roles)
3. [Functional Requirements](#3-functional-requirements)
   - 3.1 Authentication & Identity
   - 3.2 Session Management
   - 3.3 Real-Time Classroom (WebSocket)
   - 3.4 Polls & Voting
   - 3.5 AI Assistant & RAG Pipeline
   - 3.6 Resource Management
   - 3.7 Gamification
   - 3.8 Analytics & Reporting
   - 3.9 Audio & Transcription
   - 3.10 Community & Support
   - 3.11 Knowledge Cards
   - 3.12 Export
4. [Non-Functional Requirements](#4-non-functional-requirements)
   - 4.1 Performance
   - 4.2 Scalability
   - 4.3 Reliability & Availability
   - 4.4 Security
   - 4.5 Data Integrity
   - 4.6 Maintainability
5. [Current Gaps vs Requirements](#5-current-gaps-vs-requirements)
6. [Infrastructure Requirements](#6-infrastructure-requirements)

---

## 1. System Overview

SAS Edu AI is a **live classroom engagement platform** built for SASTRA University. It enables teachers to run interactive sessions with real-time polls, AI-powered Q&A over uploaded course materials, automated MCQ generation, gamified student engagement, and live attendance tracking.

**Deployment targets:**
- Frontend: Vercel (React SPA, CDN-distributed)
- Backend: Render / Railway (Node.js + Express + WebSocket)
- Database: Supabase (PostgreSQL via PgBouncer)
- Cache/Queue: Upstash Redis
- AI: HuggingFace Inference API (embeddings) + Mistral API (LLM) → future: self-hosted vLLM on DGX

**Scale target:** 1,000+ concurrent students across multiple simultaneous live classrooms.

---

## 2. User Roles

| Role | Domain | Access |
|---|---|---|
| **Teacher** | `@sastra.edu` | Create/manage sessions, upload resources, run polls, view analytics, generate MCQs, manage attendance |
| **Student** | `\d+@sastra.ac.in` (numeric ID format) | Join sessions, respond to polls, query AI, view leaderboard, earn badges |

Both roles authenticate via Google OAuth2. Domain enforcement is applied at both frontend and backend.

---

## 3. Functional Requirements

### 3.1 Authentication & Identity

| ID | Requirement | Source |
|---|---|---|
| AUTH-01 | System shall authenticate users via Google OAuth2 | `backend/routes/auth-dynamic.js` |
| AUTH-02 | Teachers must authenticate with a `@sastra.edu` Google account | `backend/middleware/auth.js` |
| AUTH-03 | Students must authenticate with a numeric `\d+@sastra.ac.in` Google account | `backend/middleware/auth.js` |
| AUTH-04 | On successful OAuth callback, backend issues a JWT (HS256, 24h expiry) | `backend/routes/auth-dynamic.js` |
| AUTH-05 | JWT shall be required on all protected routes via `Authorization: Bearer <token>` header | `backend/middleware/auth.js` |
| AUTH-06 | Role-based access control (RBAC) shall prevent students from accessing teacher routes and vice versa | `backend/middleware/auth.js` → `authorize(role)` |
| AUTH-07 | Two separate Google OAuth client pairs shall exist — one for `@sastra.edu` teachers, one for `@sastra.ac.in` students | `backend/config/oauth-dynamic.js` |
| AUTH-08 | System shall support a **demo mode** that bypasses OAuth and returns mock data | `frontend/src/utils/demoData.js` |
| AUTH-09 | *(Gap — not yet implemented)* JWT tokens shall be revocable via a token blacklist to handle compromised or expired tokens mid-session | See `SCALABILITY_REPORT.md HIGH-06` |

---

### 3.2 Session Management

| ID | Requirement | Source |
|---|---|---|
| SESS-01 | Teachers shall be able to create a session with a title and course name | `backend/routes/sessions.js:18` |
| SESS-02 | Each session shall be assigned a unique, human-readable 6-character alphanumeric `session_id` (e.g., `AB12CD`) | `backend/routes/sessions.js` |
| SESS-03 | Students shall join a session by entering the 6-character session code | `frontend/src/components/student/JoinSession.jsx` |
| SESS-04 | Session join shall record the student as a participant in `session_participants` with a `joined_at` timestamp | `backend/server.js` → WebSocket `join-session` |
| SESS-05 | Teachers shall be able to view all their past and active sessions | `backend/routes/sessions.js:39` |
| SESS-06 | Sessions shall have an `is_active` flag controllable by the teacher | `backend/routes/sessions.js` |
| SESS-07 | On session end, system shall award session completion XP and generate summaries | `backend/routes/sessions.js` → `gamification.generateSessionSummaries` |
| SESS-08 | *(Gap)* Session listing for teachers shall be paginated (20 sessions per page) to prevent analytics timeouts | See `SCALABILITY_REPORT.md HIGH-01`, `REDesign PLan.md §3.4` |
| SESS-09 | *(Gap)* Active poll timers shall be persisted and re-armed on server restart | See `SCALABILITY_REPORT.md CRIT-02`, `REDesign PLan.md §5.4` |

---

### 3.3 Real-Time Classroom (WebSocket)

| ID | Requirement | Source |
|---|---|---|
| WS-01 | System shall establish a persistent WebSocket connection per authenticated user using a JWT in the query param (`?token=`) | `backend/server.js` |
| WS-02 | Students shall join a session via `join-session` message; server registers them in the session connection map | `backend/server.js` |
| WS-03 | Teachers shall join a dashboard connection via `join-dashboard` message for real-time analytics feeds | `backend/server.js` |
| WS-04 | Server shall broadcast `poll-activated` events to all students in a session when a teacher activates a poll | `backend/server.js` → `broadcastToSession` |
| WS-05 | Server shall broadcast `poll-results-revealed` events when a poll timer expires or teacher reveals manually | `backend/server.js` |
| WS-06 | Students shall send `heartbeat` messages every 30 seconds to keep presence tracking alive | `backend/server.js:408` |
| WS-07 | Teacher shall be able to open an attendance window via `open-attendance`; students mark attendance via `mark-attendance` | `backend/server.js` |
| WS-08 | Attendance windows shall have a configured duration after which they auto-close | `backend/server.js` |
| WS-09 | *(Gap)* WebSocket broadcasts shall use Redis Pub/Sub so all server instances receive the message (cross-instance fan-out) | See `SCALABILITY_REPORT.md CRIT-02`, `REDesign PLan.md §5.2` |
| WS-10 | *(Gap)* Attendance window state shall be persisted to the database (not only in-memory) so it survives server restarts | See `SCALABILITY_REPORT.md MED-02` |
| WS-11 | *(Gap)* Heartbeat DB writes shall be batched every 30 seconds rather than one write per student per heartbeat | See `SCALABILITY_REPORT.md HIGH-02`, `REDesign PLan.md §3.2` |
| WS-12 | *(Gap)* Server shall handle SIGTERM gracefully — drain active WebSocket connections before shutdown | See `SCALABILITY_REPORT.md INFRA-05`, `REDesign PLan.md §5.5` |

---

### 3.4 Polls & Voting

| ID | Requirement | Source |
|---|---|---|
| POLL-01 | Teachers shall create polls with a question and multiple choice options | `backend/routes/polls.js` |
| POLL-02 | Teachers shall activate a poll, triggering real-time broadcast to all session participants | `backend/routes/polls.js` + `backend/server.js` |
| POLL-03 | Students shall submit a poll response; server records it in `poll_responses` with timestamp | `backend/server.js` → `poll-response` |
| POLL-04 | Polls shall support an optional timer; upon expiry, results are auto-revealed | `backend/routes/polls.js` |
| POLL-05 | Poll reveal shall broadcast correct answer, per-option counts, and per-student accuracy to the session | `backend/server.js` |
| POLL-06 | Poll responses shall be deduplicated — a student cannot respond twice to the same poll | `backend/routes/polls.js` |
| POLL-07 | Poll statistics (total responses, accuracy distribution) shall be available to the teacher in real-time | `backend/routes/polls.js` |
| POLL-08 | Correct responses shall immediately award XP to the student via the gamification system | `backend/routes/gamification.js` |

---

### 3.5 AI Assistant & RAG Pipeline

| ID | Requirement | Source |
|---|---|---|
| AI-01 | Students shall query the AI assistant with natural language questions about the session's uploaded resources | `backend/routes/ai-assistant.js`, `backend/routes/ai-search.js` |
| AI-02 | Each query shall be classified by intent: general, summarize, list_all, specific_file, comparison, etc. | `backend/services/queryClassifier.js` |
| AI-03 | Query shall be embedded using HuggingFace `sentence-transformers` and searched against Pinecone vector index | `backend/services/embeddingService.js`, `backend/services/vectorStore.js` |
| AI-04 | Top-K matching document chunks shall be retrieved and provided as context to the LLM | `backend/services/ragService.js` |
| AI-05 | LLM (Mistral-7B via HuggingFace Inference API) shall generate a response streamed back to the student | `backend/services/mistralClient.js` |
| AI-06 | RAG pipeline shall fall back to the top-matching chunk if the LLM API fails | `backend/services/ragService.js` |
| AI-07 | AI queries shall be rate-limited separately from general API calls (`aiLimiter`) | `backend/middleware/rateLimiter.js` |
| AI-08 | Resource access shall be logged when AI retrieves a document chunk | `backend/routes/ai-search.js` |
| AI-09 | *(Gap)* AI queries shall be processed asynchronously via a job queue (BullMQ) to prevent blocking HTTP connections for 30–60 seconds | See `SCALABILITY_REPORT.md CRIT-05`, `REDesign PLan.md §6` |
| AI-10 | *(Gap)* Embedding generation shall use batched HuggingFace requests instead of sequential single-chunk requests | See `SCALABILITY_REPORT.md CRIT-06` |
| AI-11 | *(Gap)* Resource access logging shall use `Promise.allSettled` instead of `async forEach` to prevent silent failures | See `SCALABILITY_REPORT.md CRIT-04` |

---

### 3.6 Resource Management

| ID | Requirement | Source |
|---|---|---|
| RES-01 | Teachers shall upload course materials in PDF, DOCX, or PPTX format (max 50MB per file) | `backend/routes/resources.js:27` |
| RES-02 | Uploaded files shall be stored in Supabase Storage | `backend/routes/resources.js` |
| RES-03 | On upload, document shall be parsed into text chunks for vectorization | `backend/services/documentProcessor.js` |
| RES-04 | Text chunks shall be embedded and stored in Pinecone with session/resource metadata filters | `backend/services/embeddingService.js`, `backend/services/vectorStore.js` |
| RES-05 | Students shall be able to view available resources for their active session | `frontend/src/components/student/SessionResources.jsx` |
| RES-06 | Teachers shall manage (list, delete) uploaded resources per session | `frontend/src/components/teacher/ResourceUploadManager.jsx` |
| RES-07 | *(Gap)* File uploads shall stream to disk before processing — not buffer entire 50MB file in Node.js memory | See `SCALABILITY_REPORT.md HIGH-03` |
| RES-08 | *(Gap)* Document parsing (PDF/DOCX/PPTX) shall run in a worker thread to avoid blocking the event loop | See `SCALABILITY_REPORT.md MED-05` |

---

### 3.7 Gamification

| ID | Requirement | Source |
|---|---|---|
| GAME-01 | Students shall earn XP for: attending sessions, answering polls, correct answers, streaks, session completion | `backend/routes/gamification.js` |
| GAME-02 | XP shall map to 7 named levels: Newcomer (0), Active Learner (100), Consistent (300), Dedicated (600), Scholar (1000), Expert (1500), Master (2500) | `backend/routes/gamification.js:8` |
| GAME-03 | Students shall earn tiered badges (Bronze / Silver / Gold) across 6 categories: attendance, accuracy, participation, improvement, consistency, session champion | `backend/routes/gamification.js:35` |
| GAME-04 | A live leaderboard shall display ranked students by XP within each session | `backend/routes/gamification.js` |
| GAME-05 | Leaderboard shall update in real-time via WebSocket when XP is awarded | `backend/server.js` |
| GAME-06 | Knowledge cards shall be available for students to vote on (thumbs up/down) | `backend/routes/knowledge-cards.js` |
| GAME-07 | *(Gap)* Leaderboard vote aggregation shall use a single `GROUP BY` query instead of one query per knowledge card pair | See `SCALABILITY_REPORT.md HIGH-07` |

---

### 3.8 Analytics & Reporting

| ID | Requirement | Source |
|---|---|---|
| ANA-01 | Teachers shall view session-level analytics: total participants, poll count, average accuracy, response rate | `backend/routes/analytics.js` |
| ANA-02 | Teachers shall view per-poll breakdown: option distribution, correct response %, student list with responses | `backend/routes/analytics.js` |
| ANA-03 | Teachers shall view per-student engagement: sessions attended, total polls answered, accuracy trend | `backend/routes/students.js` |
| ANA-04 | Analytics dashboard shall load within 3 seconds for a teacher with up to 200 sessions | Scalability target |
| ANA-05 | *(Gap)* Analytics queries shall be paginated (20 sessions per page with cursor) and backed by a materialized view for aggregated stats | See `SCALABILITY_REPORT.md HIGH-01`, `REDesign PLan.md §3.4` |

---

### 3.9 Audio & Transcription

| ID | Requirement | Source |
|---|---|---|
| AUD-01 | Teachers shall record audio in-browser using the Web Audio API | `frontend/src/components/teacher/AudioRecorder.jsx` |
| AUD-02 | Recorded audio shall be forwarded to a GPU transcription server (`GPU_TRANSCRIPTION_URL`) | `backend/routes/transcription.js` |
| AUD-03 | Transcription result shall be delivered back via a webhook (`TRANSCRIPT_WEBHOOK_URL`) | `backend/routes/transcription.js` |
| AUD-04 | Transcription shall be usable as the basis for AI-generated notes and summaries | `backend/services/notesGeneratorService.js` |

---

### 3.10 Community & Support

| ID | Requirement | Source |
|---|---|---|
| COM-01 | Students and teachers shall access a community discussion board | `backend/routes/community.js` |
| COM-02 | Users shall create support tickets with a title, category, and description | `frontend/src/components/community/CreateTicketModal.jsx` |
| COM-03 | Tickets shall be viewable in detail with threaded replies | `frontend/src/components/community/TicketDetail.jsx` |
| COM-04 | Users shall see all open tickets on the community board | `frontend/src/components/community/CommunityBoard.jsx` |

---

### 3.11 Knowledge Cards

| ID | Requirement | Source |
|---|---|---|
| KC-01 | Teachers shall create knowledge card sets per session with definition/explanation pairs | `backend/routes/knowledge-cards.js` |
| KC-02 | Students shall view knowledge cards and vote (thumbs up / thumbs down) on each pair | `frontend/src/components/student/KnowledgeCard.jsx` |
| KC-03 | Vote counts shall be displayed per pair in real-time | `backend/routes/gamification.js:159` |

---

### 3.12 Export

| ID | Requirement | Source |
|---|---|---|
| EXP-01 | Teachers shall export session data (participants, responses, attendance) as CSV | `backend/routes/export.js` |
| EXP-02 | Teachers shall export session data as a formatted PDF report | `backend/routes/export.js` |
| EXP-03 | Generated MCQs shall be exportable from the teacher dashboard | `frontend/src/components/teacher/GeneratedMCQs.jsx` |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Current State | Target |
|---|---|---|---|
| PERF-01 | Poll response delivery latency (teacher activates → student receives) | Unmeasured | < 200ms P95 |
| PERF-02 | API response time for standard CRUD endpoints | Unmeasured | < 300ms P95 |
| PERF-03 | Teacher analytics dashboard load time (200 sessions) | 10–30s (no indexes, no pagination) | < 3s |
| PERF-04 | AI query first-byte response time (async pattern) | 30–60s blocking | < 2s (202 queued), result in < 60s |
| PERF-05 | Document vectorization time per 100-page PDF | 120–180s (sequential) | < 10s (batched) |
| PERF-06 | WebSocket heartbeat DB write throughput | 16 writes/sec at 500 users | 1 batch write per 30s regardless of user count |
| PERF-07 | Page initial load time on university WiFi | Unmeasured | < 3s |

---

### 4.2 Scalability

| ID | Requirement | Current State | Target |
|---|---|---|---|
| SCALE-01 | Concurrent user capacity | ~50 (DB pool exhausted at 5 connections) | 1,000+ concurrent users |
| SCALE-02 | Concurrent live classrooms | 1 (single process, in-memory state) | 20+ simultaneous sessions |
| SCALE-03 | Horizontal scaling capability | None (in-memory Maps, no shared state) | N server instances via Redis pub/sub |
| SCALE-04 | Database connection capacity | 5 (direct Supabase pool) | 1,000+ via PgBouncer transaction pooler |
| SCALE-05 | AI query concurrency | 5 (RequestQueue limit, blocking) | Unlimited (async BullMQ queue, 10 workers) |
| SCALE-06 | File upload concurrency | ~5 before OOM (50MB × 5 = 250MB RAM) | 50+ (streaming to disk/Supabase signed URLs) |
| SCALE-07 | WebSocket connections per instance | Unbounded (no backpressure) | Managed with per-connection buffering limits |

---

### 4.3 Reliability & Availability

| ID | Requirement | Current State | Target |
|---|---|---|---|
| REL-01 | Server restart during live class | Destroys all in-memory state (sessions, attendance, polls) | Zero data loss — all state persisted to DB + Redis |
| REL-02 | Poll timer survival on redeploy | Lost (stored in `global.pollTimers`) | Re-armed from DB on startup |
| REL-03 | Attendance window survival on restart | Lost (stored in `attendanceWindows` Map) | Persisted to `attendance_windows` table |
| REL-04 | AI job retry on failure | None (synchronous, no retry) | BullMQ: 3 retries with exponential backoff |
| REL-05 | Embedding job retry on HuggingFace rate limit | `sleep(1000)` per chunk, no retry queue | BullMQ delayed retry with backoff |
| REL-06 | Health check endpoint | None | `GET /health` returning `{ status, uptime, db, redis }` |
| REL-07 | Graceful shutdown | Abrupt — in-flight WebSocket messages lost | SIGTERM drains connections before closing |
| REL-08 | Uptime target | Single process on Render free tier — restarts under memory pressure | 99.5% during active class hours |

---

### 4.4 Security

| ID | Requirement | Current State | Target |
|---|---|---|---|
| SEC-01 | Domain-restricted OAuth — only `@sastra.edu` teachers, `@sastra.ac.in` students | Implemented | Maintained |
| SEC-02 | IDOR prevention — all routes check `req.user.id` against resource owner | Implemented | Maintained on all new routes |
| SEC-03 | JWT token revocation | Not implemented — tokens live until 24h expiry | Token blacklist in Redis (jti-based) |
| SEC-04 | Rate limiting | Implemented (auth, API, AI limiters) | Distributed rate limiting via Redis to work across instances |
| SEC-05 | SQL injection prevention | Implemented — all queries use `$1/$2` parameterized placeholders | Maintained |
| SEC-06 | Secrets management | Environment variables only — no hardcoded secrets | Maintained via `.env` (gitignored) |
| SEC-07 | HTTPS | Enforced by Vercel (frontend) and Render (backend) | Maintained |
| SEC-08 | WebSocket authentication | JWT in query param (`?token=`) — verified on connection | Token expiry enforced during connection upgrade |
| SEC-09 | File upload validation | 50MB limit, MIME type check (PDF/DOCX/PPTX) | Enforce server-side MIME validation in addition to extension check |

---

### 4.5 Data Integrity

| ID | Requirement | Current State | Target |
|---|---|---|---|
| INT-01 | Attendance records | Lost on server restart | Persisted to DB on every mark; in-memory Map is write-through cache only |
| INT-02 | Resource access logs | Fire-and-forget (`async forEach`) — silently dropped under load | `Promise.allSettled` — all inserts tracked |
| INT-03 | Poll responses | Deduplicated at DB level | Unique constraint on `(poll_id, student_id)` |
| INT-04 | Heartbeat timestamps | In-memory only (`heartbeatLastUpdate` Map — never cleaned up) | Batched flush to DB every 30s; Redis hash as staging area |
| INT-05 | Database indexes | Missing on 5 high-traffic column groups | Migration `001_performance_indexes.sql` applied before production launch |
| INT-06 | SELECT * queries | Used in 6+ files including auth middleware on every request | Replace with explicit column selection in all performance-critical paths |

---

### 4.6 Maintainability

| ID | Requirement | Current State | Target |
|---|---|---|---|
| MAINT-01 | Logging | Winston logger (`LOG_LEVEL` env var) — implemented | Log levels respected in all new code; structured JSON logs |
| MAINT-02 | Test coverage | Jest tests for routes, middleware, agents | All new routes have matching test files |
| MAINT-03 | Error handling | Catch blocks present but some mask DB errors as 401 | Distinct error codes for DB failures vs auth failures |
| MAINT-04 | Observability | Server logs only | Health endpoint + Bull Board (BullMQ) for queue visibility |
| MAINT-05 | In-memory cache fallback | Hand-rolled LRU with no actual LRU eviction | Replace with `lru-cache` npm package |

---

## 5. Current Gaps vs Requirements

The following requirements are **defined above but not yet implemented**. They are the direct output of the scalability audit.

### Critical (platform unusable at scale without these)

| Gap | Requirement ID | File / Location | Fix Effort |
|---|---|---|---|
| DB pool = 5, breaks at 50 users | SCALE-04 | `backend/db.js:19` | 15 min |
| WebSocket state in-memory, no horizontal scale | WS-09, SCALE-03 | `backend/server.js:34` | 3 days |
| JWT auth hits DB on every request | PERF-02 | `backend/middleware/auth.js:17` | 2 hr |
| `async forEach` fire-and-forget logging (×2) | INT-02 | `backend/routes/ai-search.js:104,383` | 1 hr |
| AI pipeline blocks HTTP for 60s | AI-09, PERF-04 | `backend/services/ragService.js:30` | 3 days |
| Sequential embedding with 1s forced delays | AI-10, PERF-05 | `backend/services/embeddingService.js:13` | 1 day |

### High (significant degradation under university load)

| Gap | Requirement ID | File / Location | Fix Effort |
|---|---|---|---|
| Analytics queries not paginated | ANA-05, SESS-08 | `backend/routes/analytics.js:61` | 3 hr |
| Heartbeat = 1 DB write per student | WS-11 | `backend/server.js:408` | 2 hr |
| 50MB uploads buffered in RAM | RES-07 | `backend/routes/resources.js:27` | 1 day |
| Student dashboard HTTP polling | No WS alternative | `frontend/.../EnhancedStudentDashboard.jsx:57` | 4 hr |
| `setInterval` with no duration in GeneratedMCQs | MAINT-02 | `frontend/.../GeneratedMCQs.jsx:223` | 30 min |
| JWT tokens not revocable | SEC-03 | `backend/middleware/auth.js` | 4 hr |
| Leaderboard N+1 queries | GAME-07 | `backend/routes/gamification.js:159` | 1 hr |

### Medium (user-visible issues at scale)

| Gap | Requirement ID | File / Location | Fix Effort |
|---|---|---|---|
| Attendance windows not persisted | WS-10 | `backend/server.js:42,568` | 3 hr |
| Poll timers not persisted | SESS-09 | `backend/server.js` | 2 hr |
| SSE has no event ID for reconnection | AI-01 | `frontend/src/hooks/useAIChat.js:129` | 2 hr |
| localStorage read on every API call | PERF-07 | `frontend/src/utils/api.js:20` | 1 hr |
| Document parsing blocks event loop | RES-08 | `backend/services/documentProcessor.js` | 1 day |
| No HTTP cache headers | PERF-02 | All API routes | 2 hr |
| Poll broadcast queries DB on every fire | PERF-01 | `backend/server.js:483` | 2 hr |

---

## 6. Infrastructure Requirements

These are system-level prerequisites — not individual code fixes — that determine the platform's scale ceiling.

| Component | Current | Required | Rationale |
|---|---|---|---|
| **Redis** | None | Upstash Redis | Enables: JWT caching, WebSocket pub/sub, BullMQ job queue, distributed rate limiting, token blacklist |
| **Message Queue** | None | BullMQ (on Redis) | Makes AI pipeline async — prevents 60s blocking HTTP connections |
| **DB Connection Pooler** | Direct Supabase (pool: 5) | Supabase PgBouncer transaction mode (port 6543) | Multiplexes 1,000+ app connections to the 15 Supabase allows |
| **DB Indexes** | None on high-traffic columns | 6 indexes via `CONCURRENTLY` migration | Analytics and leaderboard queries from 30s → <100ms |
| **CDN for Uploads** | None (Supabase origin) | Supabase Storage CDN (toggle in dashboard) | Geographic distribution, bandwidth cost reduction |
| **Health Endpoint** | None | `GET /health` with DB + Redis probe | Load balancer readiness checks, crash detection |
| **Process Manager** | Single process | PM2 cluster mode | Uses all available CPU cores on Render |
| **Graceful Shutdown** | None | SIGTERM handler | Prevents data loss on Render deploys during live classes |
| **Worker Threads** | None | `worker_threads` for document parsing | Unblocks Node.js event loop during 1–30s PDF parsing |

### Implementation order

```
Week 1 (no architecture changes):
  ├── db.js:19 — raise pool to 20, switch to pooler URL
  ├── ai-search.js:104,383 — fix async forEach → Promise.allSettled
  ├── server.js:408 — batch heartbeat writes
  ├── analytics.js:61 — paginate session listing
  ├── GeneratedMCQs.jsx:223 — add missing setInterval duration + cleanup
  ├── api.js:20 — cache currentUser in React context
  └── Database — run performance index migration

Week 2 (Redis):
  ├── Install Upstash Redis + ioredis
  ├── Cache JWT auth user lookups (5 min TTL)
  ├── Replace in-memory Maps with Redis (sessions, attendance, heartbeats)
  ├── Redis pub/sub for WebSocket cross-instance broadcast
  └── Persist attendance windows to DB + Redis write-through

Week 3 (Async AI pipeline):
  ├── BullMQ: ai-queries queue + worker
  ├── BullMQ: vectorization queue + batched embedding worker
  ├── SSE job-status endpoint for frontend progress
  └── worker_threads for document parsing

Month 2 (Polish):
  ├── Supabase signed upload URLs (no 50MB RAM spikes)
  ├── HTTP ETag + Cache-Control on all API responses
  ├── Replace student dashboard polling with WebSocket push
  ├── JWT token blacklist (jti in Redis SET)
  ├── GET /health endpoint + SIGTERM graceful shutdown
  └── SSE event IDs for AI response reconnection
```

---

*Generated from full codebase + documentation audit — 2026-03-26*
*Covers: CLAUDE.md · SCALABILITY_ISSUES.md · SCALABILITY_REPORT.md · REDesign PLan.md · LEARNING_RESOURCES.md · backend/ · frontend/ source code*

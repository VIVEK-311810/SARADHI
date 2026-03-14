# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This workspace contains two separate repositories for the **SAS Edu AI** platform — a live classroom tool for SASTRA University:

- `SAS-EDU-AI_F/` — React frontend (deployed on Vercel)
- `sas_b/` — Express.js backend (deployed on Render)

---

## Frontend (`SAS-EDU-AI_F/`)

### Commands

```bash
npm start          # Dev server (CRA)
npm run build      # Production build (CI=false to suppress warnings)
npm test           # Run tests with React Testing Library / Jest
```

### Architecture

**Entry point:** `src/index.js` → `src/App.js` (React Router v6 routes)

**Role-based routing:** Two protected route trees — `/teacher/*` and `/student/*` — gated by the role stored in localStorage after OAuth.

**API layer:** All HTTP calls go through `src/utils/api.js` → `apiRequest()`. This function:
- Attaches the JWT Bearer token from localStorage
- Enforces a 15-second timeout via `AbortController`
- Intercepts calls in **demo mode** (`localStorage.getItem('isDemo')`) and returns mock data from `src/utils/demoData.js`

**Auth flow:** Google OAuth is initiated by role (`/auth/google/teacher` or `/auth/google/student`). On callback the backend issues a JWT; `src/components/auth/OAuth2Callback.jsx` stores it and redirects to the dashboard.

**Email domain enforcement (frontend + backend):**
- Teachers: `@sastra.edu`
- Students: numeric ID `@sastra.ac.in` (regex `^\d+@sastra\.ac\.in$`)

**Theme:** `src/context/ThemeContext.jsx` — dark/light toggle persisted to localStorage.

**Key env vars:**
```
REACT_APP_API_URL      # e.g. https://vk-edu-b2.onrender.com/api
REACT_APP_AUTH_URL     # e.g. https://vk-edu-b2.onrender.com
REACT_APP_WS_URL       # e.g. wss://vk-edu-b2.onrender.com
```

---

## Backend (`sas_b/`)

### Commands

```bash
npm run dev        # nodemon server.js
npm start          # node server.js
npm test           # jest --verbose --forceExit --detectOpenHandles
npm run test:watch # jest --watch --forceExit --detectOpenHandles
```

### Architecture

**Entry point:** `server.js` — mounts all Express routers and initialises the WebSocket server.

**Database:** PostgreSQL via Supabase connection pool (`db.js`). All queries use parameterised `$1/$2` placeholders. Pool is capped at 5 connections (Supabase free-tier constraint).

**Middleware chain:**
1. `middleware/auth.js` — `authenticateToken` (JWT HS256, 24 h expiry), `authorize(role)` (RBAC), SASTRA domain validation
2. `middleware/rateLimiter.js` — separate limiters: `authLimiter`, `apiLimiter`, `aiLimiter`

**Route → feature mapping:**

| File | Purpose |
|---|---|
| `routes/auth.js` / `auth-dynamic.js` | Google OAuth2 per role; issues JWT |
| `routes/sessions.js` | Session CRUD; 6-char string `session_id` |
| `routes/polls.js` | Poll lifecycle + real-time activation |
| `routes/resources.js` / `resources-upload.js` | File upload to Supabase; triggers vectorisation |
| `routes/ai-search.js` | RAG pipeline (classify → embed → Pinecone → Mistral-7B) |
| `routes/generated-mcqs.js` | Auto-generate quiz questions from resources |
| `routes/analytics.js` | Teacher session analytics |
| `routes/students.js` | Student dashboard stats |
| `routes/gamification.js` | Points, badges, leaderboard |
| `routes/community.js` | Discussion board & support tickets |
| `routes/transcription.js` | Forwards audio to GPU server |
| `routes/export.js` | CSV/PDF data export |

**WebSocket (in `server.js`):** JWT-authenticated via `?token=` query param. Message types: `join-session`, `poll-response`, `activate-poll`, `heartbeat`, `join-dashboard`, `open-attendance`, `close-attendance`. Maintains per-session and per-dashboard connection maps.

**AI/RAG pipeline (`services/`):**
1. `queryClassifier.js` — classifies intent (general, summarize, list_all, specific file, etc.)
2. `embeddingService.js` — HuggingFace embeddings
3. `vectorStore.js` — Pinecone upsert/query
4. `ragService.js` — Mistral-7B via HuggingFace Inference API; falls back to top matching chunk on failure
5. `documentProcessor.js` — parses PDF / DOCX / PPTX for chunking

**Logging:** Winston (`logger.js`); level controlled by `LOG_LEVEL` env var.

**Key env vars:**
```
DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT
JWT_SECRET, SESSION_SECRET
GOOGLE_CLIENT_ID_EDU, GOOGLE_CLIENT_SECRET_EDU
GOOGLE_CLIENT_ID_ACIN, GOOGLE_CLIENT_SECRET_ACIN
GOOGLE_CALLBACK_URL_EDU, GOOGLE_CALLBACK_URL_ACIN
FRONTEND_URL
SUPABASE_URL, SUPABASE_SERVICE_KEY
PINECONE_API_KEY, PINECONE_INDEX
HUGGINGFACE_API_KEY
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
GPU_TRANSCRIPTION_URL, TRANSCRIPT_WEBHOOK_URL
```

---

## Cross-Cutting Concerns

- **IDOR prevention:** Every protected route checks `req.user.id` against the resource owner before returning data.
- **Dual OAuth strategies:** Two separate Google OAuth client pairs — one for `@sastra.edu` (teachers), one for `@sastra.ac.in` (students) — selected dynamically in `config/oauth-dynamic.js`.
- **Session ID format:** Sessions use a short 6-character alphanumeric code (not a UUID) as `session_id`.
- **File size limit:** 50 MB for resource uploads.
- **Supported upload formats:** PDF, DOCX, PPTX.

# SARADHI — SAS Edu AI

> Live classroom engagement platform for SASTRA University.
> Teachers run interactive sessions; students join with a 6-character code and get real-time polls, AI-powered Q&A over course materials, gamification, and automated MCQs.

---

## Deployment

| Layer | Service | URL |
|---|---|---|
| Frontend | Vercel (React SPA) | — |
| Backend | Render (Node.js + Express + WebSocket) | — |
| Database | Supabase (PostgreSQL via PgBouncer) | — |
| Cache / Queue | Upstash Redis + BullMQ | — |
| AI | HuggingFace Inference API + Mistral-7B | — |
| Vector Store | Pinecone | — |

---

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env   # fill in secrets
npm install
npm run dev            # nodemon server.js
```

### Frontend
```bash
cd frontend
cp .env.example .env.local   # fill in REACT_APP_API_URL etc.
npm install
npm start              # CRA dev server
```

---

## Folder Structure

```
SARADHI/
│
├── backend/                        # Express.js API + WebSocket server
│   ├── server.js                   # Entry point — mounts all routers, starts WS server
│   ├── db.js                       # PostgreSQL pool (Supabase)
│   ├── redis.js                    # Upstash Redis client
│   ├── logger.js                   # Winston logger
│   │
│   ├── config/
│   │   ├── oauth-dynamic.js        # Dual Google OAuth clients (teacher + student)
│   │   ├── pinecone.js             # Pinecone index client
│   │   └── supabase.js             # Supabase admin client
│   │
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification + RBAC (authenticateToken, authorize)
│   │   └── rateLimiter.js          # authLimiter / apiLimiter / aiLimiter
│   │
│   ├── routes/
│   │   ├── auth-dynamic.js         # Google OAuth flow, JWT issuance
│   │   ├── sessions.js             # Session CRUD
│   │   ├── polls.js                # Poll lifecycle
│   │   ├── resources.js            # File uploads → Supabase Storage + vectorization
│   │   ├── ai-search.js            # RAG pipeline (classify → embed → Pinecone → Mistral)
│   │   ├── ai-assistant.js         # Alternate AI Q&A endpoint
│   │   ├── generated-mcqs.js       # Auto MCQ generation
│   │   ├── analytics.js            # Teacher session analytics
│   │   ├── students.js             # Student dashboard stats
│   │   ├── gamification.js         # XP, badges, leaderboard
│   │   ├── knowledge-cards.js      # Knowledge card CRUD + votes
│   │   ├── community.js            # Discussion board + support tickets
│   │   ├── transcription.js        # Audio → GPU transcription server
│   │   ├── export.js               # CSV / PDF export
│   │   └── health.js               # GET /health (db + redis probe)
│   │
│   ├── services/                   # Business logic / AI pipeline
│   │   ├── ragService.js           # Orchestrates RAG: embed → retrieve → generate
│   │   ├── queryClassifier.js      # Intent classification (summarize, list_all, etc.)
│   │   ├── embeddingService.js     # HuggingFace sentence-transformer embeddings
│   │   ├── vectorStore.js          # Pinecone upsert / query
│   │   ├── mistralClient.js        # Mistral-7B streaming via HuggingFace Inference API
│   │   ├── documentProcessor.js    # PDF / DOCX / PPTX → text chunks
│   │   ├── mcqAgent.js             # MCQ generation from resource chunks
│   │   ├── notesAgent.js           # Auto-notes generation from transcript
│   │   ├── notesGeneratorService.js# Notes pipeline orchestration
│   │   ├── keyPointsAgent.js       # Key-points extraction
│   │   ├── quizGenerator.js        # Quiz assembly
│   │   ├── summarizationService.js # Session summarization
│   │   ├── audioProcessor.js       # Audio pre-processing helpers
│   │   ├── cacheService.js         # Redis-backed cache helpers
│   │   └── requestQueue.js         # In-process concurrency limiter (legacy)
│   │
│   ├── repositories/               # Named SQL query functions (no inline SQL in routes)
│   │   ├── sessions.js             # getSessionByCode, getTeacherSessions, createSession, …
│   │   └── polls.js                # getActivePoll, getPollWithResponses, createPoll, closePoll
│   │
│   ├── ws/
│   │   └── sessionSocket.js        # WebSocket handler (join-session, heartbeat, poll-response, …)
│   │
│   ├── workers/
│   │   ├── aiWorker.js             # BullMQ worker — processes async AI jobs
│   │   └── setup.js                # Bull Board mount + queue wiring
│   │
│   ├── queues/
│   │   └── index.js                # BullMQ queue definitions
│   │
│   ├── migrations/
│   │   ├── 001_transcription_schema.sql
│   │   ├── 002_uploaded_resources.sql
│   │   ├── 003_gamification_schema.sql
│   │   ├── 004_ai_enhancements.sql
│   │   ├── 005_production_hardening.sql
│   │   ├── 006_performance_indexes.sql
│   │   ├── 007_attendance_community.sql
│   │   ├── 008_ai_study_assistant.sql
│   │   ├── 009_gamification_revamp.sql
│   │   ├── 010_knowledge_cards.sql
│   │   └── autoMigrate.js          # Runs all migrations on server start
│   │
│   └── __tests__/                  # Jest test suite
│       ├── auth.middleware.test.js
│       ├── sessions.routes.test.js
│       ├── polls.routes.test.js
│       ├── analytics.routes.test.js
│       ├── export.routes.test.js
│       ├── poll-lifecycle.test.js
│       ├── agents.test.js
│       ├── helpers.js
│       └── setup.js
│
├── frontend/                       # React SPA (Create React App)
│   ├── src/
│   │   ├── App.js                  # Root router — role-based route trees (teacher / student)
│   │   ├── index.js                # React entry point
│   │   │
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── RoleSelection.jsx       # Pick teacher / student → initiates OAuth
│   │   │   │   └── OAuth2Callback.jsx      # Handles OAuth redirect, stores JWT
│   │   │   │
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.jsx           # Sidebar + TopBar wrapper
│   │   │   │   ├── Sidebar.jsx             # Role-aware navigation sidebar
│   │   │   │   └── TopBar.jsx              # Header with theme toggle + user info
│   │   │   │
│   │   │   ├── shared/
│   │   │   │   ├── SessionResources.jsx    # Role router → ResourceUpload (teacher) or ResourceViewer (student)
│   │   │   │   ├── SessionHistory.jsx      # Past sessions list (both roles)
│   │   │   │   ├── ErrorBoundary.jsx       # React error boundary
│   │   │   │   ├── ErrorCard.jsx           # Reusable error state with retry button
│   │   │   │   ├── ErrorScreen.jsx         # Full-page error display
│   │   │   │   ├── LoadingSpinner.jsx      # Full-page loading state
│   │   │   │   ├── SkeletonLoader.jsx      # Content skeleton placeholders
│   │   │   │   ├── DemoBanner.jsx          # Demo mode banner
│   │   │   │   ├── Navbar.jsx              # Top navigation bar
│   │   │   │   ├── Header.jsx              # Page-level header component
│   │   │   │   └── ThemeToggle.jsx         # Dark / light toggle button
│   │   │   │
│   │   │   ├── teacher/
│   │   │   │   ├── EnhancedTeacherDashboard.jsx  # Teacher home — session list + stats
│   │   │   │   ├── EnhancedSessionManagement.jsx # Live session orchestrator (~975 lines)
│   │   │   │   ├── PollPanel.jsx                 # Poll create / activate / end
│   │   │   │   ├── AttendancePanel.jsx            # Attendance window + participant table
│   │   │   │   ├── AudioRecorder.jsx              # In-browser audio recording + transcription
│   │   │   │   ├── GeneratedMCQs.jsx              # MCQ list, edit, delete, quiz launch
│   │   │   │   ├── NotesPanel.jsx                 # Auto-notes generation status + preview
│   │   │   │   ├── ResourceUpload.jsx             # Signed-URL upload to Supabase Storage
│   │   │   │   ├── CreateSession.jsx              # New session form
│   │   │   │   ├── TeacherAnalytics.jsx           # Session analytics dashboard
│   │   │   │   ├── ExportButtons.jsx              # CSV / PDF export controls
│   │   │   │   ├── KnowledgeCards.jsx             # Knowledge card set management
│   │   │   │   └── DoubtsDashboard.jsx            # Student doubts / stuck signals
│   │   │   │
│   │   │   ├── student/
│   │   │   │   ├── EnhancedStudentDashboard.jsx   # Student home — joined sessions + stats
│   │   │   │   ├── EnhancedStudentSession.jsx     # Live session view (polls, AI, leaderboard)
│   │   │   │   ├── JoinSession.jsx                # Enter 6-char session code
│   │   │   │   ├── ResourceViewer.jsx             # Browse / search / download session resources
│   │   │   │   ├── AIAssistant.jsx                # AI chat over session resources
│   │   │   │   ├── AIResourceSearch.jsx           # Semantic resource search
│   │   │   │   ├── Quiz.jsx                       # MCQ quiz session
│   │   │   │   ├── QuizCard.jsx                   # Single MCQ question card
│   │   │   │   ├── KnowledgeCard.jsx              # Knowledge card with up/down vote
│   │   │   │   ├── Leaderboard.jsx                # XP leaderboard
│   │   │   │   ├── VisitSession.jsx               # Past session replay / history
│   │   │   │   └── SourceCard.jsx                 # AI source citation card
│   │   │   │
│   │   │   ├── community/
│   │   │   │   ├── CommunityBoard.jsx             # Discussion board (all tickets)
│   │   │   │   ├── CreateTicketModal.jsx          # New support ticket form
│   │   │   │   ├── TicketCard.jsx                 # Ticket list item
│   │   │   │   └── TicketDetail.jsx               # Ticket thread with replies
│   │   │   │
│   │   │   ├── landing/
│   │   │   │   ├── LandingPage.jsx                # Marketing landing page
│   │   │   │   ├── HeroSection.jsx
│   │   │   │   ├── ProblemSection.jsx
│   │   │   │   ├── HowItWorksSection.jsx
│   │   │   │   ├── AISection.jsx
│   │   │   │   ├── RealTimeSection.jsx
│   │   │   │   ├── GamificationSection.jsx
│   │   │   │   ├── AnalyticsSection.jsx
│   │   │   │   ├── CTASection.jsx
│   │   │   │   ├── OriginSection.jsx
│   │   │   │   ├── TurningPointSection.jsx
│   │   │   │   ├── LandingNavbar.jsx
│   │   │   │   └── ParticleBackground.jsx
│   │   │   │
│   │   │   └── demo/
│   │   │       ├── TeacherDemo.jsx                # Interactive teacher demo (no login)
│   │   │       └── StudentDemo.jsx                # Interactive student demo (no login)
│   │   │
│   │   ├── context/
│   │   │   ├── ThemeContext.jsx        # Dark / light theme state (persisted to localStorage)
│   │   │   └── NotificationContext.jsx # In-app notification state
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAIChat.js            # AI chat state + SSE streaming hook
│   │   │   └── useAudioRecorder.js     # MediaRecorder wrapper hook
│   │   │
│   │   ├── utils/
│   │   │   ├── api.js                  # All HTTP calls — attaches JWT, 15s timeout, demo intercept
│   │   │   ├── demoData.js             # Mock data returned in demo mode
│   │   │   └── constants.js            # Shared constants (XP thresholds, badge tiers, etc.)
│   │   │
│   │   └── __tests__/                 # Jest + React Testing Library
│   │       ├── api.utils.test.js
│   │       ├── RoleSelection.test.js
│   │       ├── JoinSession.test.js
│   │       ├── Header.test.js
│   │       └── ExportButtons.test.js
│   │
│   └── public/
│       ├── index.html
│       ├── manifest.json
│       └── _redirects              # Netlify/Vercel SPA fallback
│
├── DB/                             # Canonical database schema (source of truth)
│   ├── 00_extensions.sql
│   ├── 01_tables.sql
│   ├── 02_indexes.sql
│   ├── 03_triggers.sql
│   ├── 04_rls.sql
│   ├── full_schema.sql             # Combined single-file schema
│   └── setup.sh                    # One-shot DB setup script
│
├── .github/
│   └── workflows/
│       ├── backend.yml             # CI: test backend on push
│       └── frontend.yml            # CI: build frontend on push
│
├── DATABASE_SCHEMA.md              # Human-readable schema documentation
├── REQUIREMENTS.md                 # Full functional + non-functional requirements audit
├── SCALABILITY_REPORT.md           # Scalability gaps + fix prioritisation
├── PRODUCTION_DGX_PLAN.md          # Plan for self-hosted vLLM on DGX server
├── LEARNING_RESOURCES.md           # Learning references for all technologies used
├── REDesign PLan.md                # Architecture redesign plan (Phases 1–4 complete)
└── CLAUDE.md                       # Claude Code instructions for this repository
```

---

## Architecture Overview

```
Browser (React SPA)
  │
  ├── REST (JWT Bearer)  ──→  Express API (Render)
  │                               ├── PostgreSQL (Supabase, via PgBouncer)
  │                               ├── Supabase Storage (file uploads)
  │                               ├── Pinecone (vector index)
  │                               ├── HuggingFace Inference API (embeddings + Mistral)
  │                               ├── Upstash Redis (cache, BullMQ, pub/sub)
  │                               └── BullMQ workers (async AI + vectorization jobs)
  │
  └── WebSocket (JWT ?token=)  ──→  ws server (same Express process)
                                      └── Redis Pub/Sub (cross-instance broadcast)
```

### Auth flow
1. User clicks **Sign in as Teacher / Student** → redirected to Google OAuth
2. Google returns to `/auth/callback?role=teacher|student`
3. Backend validates domain (`@sastra.edu` teacher, `\d+@sastra.ac.in` student), issues **JWT (HS256, 24h)**
4. Frontend stores JWT in `localStorage`; all API calls and WebSocket connections attach it

### Resource upload flow
1. Frontend calls `POST /resources/upload-url` → backend returns a Supabase signed URL
2. Frontend PUTs the file **directly to Supabase Storage** via XHR (no bytes through Node.js)
3. Frontend calls `POST /resources/upload-complete` → backend triggers vectorization job

### RAG pipeline
```
Student query
  → queryClassifier (intent: general / summarize / list_all / specific_file / …)
  → embeddingService (HuggingFace sentence-transformers)
  → vectorStore.query (Pinecone top-K chunks)
  → ragService.generateAnswer (Mistral-7B streamed via HuggingFace Inference API)
  → SSE stream back to student
```

---

## Environment Variables

### Backend (`.env`)
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
REDIS_URL
LOG_LEVEL
```

### Frontend (`.env.local`)
```
REACT_APP_API_URL      # https://your-backend.onrender.com/api
REACT_APP_AUTH_URL     # https://your-backend.onrender.com
REACT_APP_WS_URL       # wss://your-backend.onrender.com
```

---

## Running Tests

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

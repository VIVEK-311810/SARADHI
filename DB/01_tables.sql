-- ============================================================
-- 01_tables.sql
-- All 31 tables in strict dependency order (parents before children)
-- Sourced from live Supabase database — Project_IIT (ap-south-1)
-- PostgreSQL 17 compatible
-- ============================================================

-- ─── SECTION 1: CORE ────────────────────────────────────────

-- Users (teachers + students, no foreign key dependencies)
CREATE TABLE IF NOT EXISTS users (
  id                  VARCHAR PRIMARY KEY,  -- SHA256 hash (teacher) or register number (student)
  email               VARCHAR NOT NULL UNIQUE,
  full_name           VARCHAR NOT NULL,
  role                VARCHAR NOT NULL CHECK (role IN ('teacher', 'student')),
  register_number     VARCHAR,
  department          VARCHAR,
  oauth_provider      VARCHAR DEFAULT 'google',
  oauth_id            VARCHAR,
  profile_picture_url TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login          TIMESTAMP,
  is_active           BOOLEAN DEFAULT true
);

COMMENT ON TABLE  users IS 'Stores both teachers and students with OAuth2 authentication and SASTRA domain restrictions';
COMMENT ON COLUMN users.id IS 'Custom ID: SHA256 hash of name for teachers, student number for students';
COMMENT ON COLUMN users.email IS 'Must be @sastra.edu for teachers or number@sastra.ac.in for students';


-- Sessions (depends on users)
CREATE TABLE IF NOT EXISTS sessions (
  id                  SERIAL PRIMARY KEY,
  session_id          VARCHAR NOT NULL UNIQUE, -- 6-char human-readable join code e.g. ABC123
  teacher_id          VARCHAR REFERENCES users(id),
  title               VARCHAR NOT NULL,
  description         TEXT,
  course_name         VARCHAR,
  is_active           BOOLEAN DEFAULT false,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at            TIMESTAMP,
  is_live             BOOLEAN NOT NULL DEFAULT false,
  live_started_at     TIMESTAMP,
  live_ended_at       TIMESTAMP,
  notes_status        VARCHAR DEFAULT 'none',
  notes_url           TEXT,
  notes_generated_at  TIMESTAMP,
  notes_error         TEXT,
  leaderboard_visible BOOLEAN DEFAULT false
);

COMMENT ON TABLE  sessions IS 'Class sessions created by teachers that students can join';
COMMENT ON COLUMN sessions.session_id IS 'Human-readable ID that students use to join sessions (e.g., ABC123)';


-- Session participants (depends on sessions, users)
CREATE TABLE IF NOT EXISTS session_participants (
  id                   SERIAL PRIMARY KEY,
  session_id           INTEGER REFERENCES sessions(id),
  student_id           VARCHAR REFERENCES users(id),
  joined_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at              TIMESTAMP,
  is_active            BOOLEAN DEFAULT true,
  connection_status    VARCHAR DEFAULT 'offline' CHECK (connection_status IN ('online', 'offline')),
  websocket_id         VARCHAR,
  last_activity        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  attendance_status    VARCHAR,              -- NULL=not taken, 'present', 'late', 'absent'
  attendance_marked_at TIMESTAMP,
  UNIQUE (session_id, student_id)
);

COMMENT ON TABLE session_participants IS 'Junction table tracking student participation in sessions with real-time status';


-- ─── SECTION 2: POLLS ───────────────────────────────────────

-- Polls (depends on sessions)
CREATE TABLE IF NOT EXISTS polls (
  id             SERIAL PRIMARY KEY,
  session_id     INTEGER REFERENCES sessions(id),
  question       TEXT NOT NULL,
  options        JSONB NOT NULL,            -- e.g. ["Option A", "Option B", "Option C", "Option D"]
  correct_answer INTEGER,                   -- zero-based index into options
  justification  TEXT,
  time_limit     INTEGER DEFAULT 60,        -- seconds
  is_active      BOOLEAN DEFAULT false,
  queue_status   VARCHAR DEFAULT 'manual' CHECK (queue_status IN ('manual', 'queued', 'active', 'completed')),
  queue_position INTEGER,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activated_at   TIMESTAMP,
  completed_at   TIMESTAMP,
  ends_at        TIMESTAMP,                 -- persists timer across server restarts
  difficulty     INTEGER DEFAULT 1          -- 1=easy, 2=medium, 3=hard
);

COMMENT ON TABLE  polls IS 'Polls/MCQs created by teachers for real-time student engagement with queue management';
COMMENT ON COLUMN polls.options IS 'JSON array of poll options, e.g., ["Option A", "Option B", "Option C", "Option D"]';
COMMENT ON COLUMN polls.correct_answer IS 'Zero-based index of the correct answer in the options array';


-- Poll responses (depends on polls, users)
CREATE TABLE IF NOT EXISTS poll_responses (
  id              SERIAL PRIMARY KEY,
  poll_id         INTEGER REFERENCES polls(id),
  student_id      VARCHAR REFERENCES users(id),
  selected_option INTEGER NOT NULL,         -- zero-based index
  is_correct      BOOLEAN,
  response_time   INTEGER,                  -- milliseconds from activation to response
  responded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_id, student_id)              -- prevents double-answering
);

COMMENT ON TABLE  poll_responses IS 'Student responses to polls with timing and correctness tracking';
COMMENT ON COLUMN poll_responses.selected_option IS 'Zero-based index of the option selected by the student';


-- AI-generated MCQs awaiting teacher approval (depends on sessions)
CREATE TABLE IF NOT EXISTS generated_mcqs (
  id               SERIAL PRIMARY KEY,
  session_id       INTEGER REFERENCES sessions(id),
  question         TEXT NOT NULL,
  options          JSONB NOT NULL,
  correct_answer   INTEGER NOT NULL,
  justification    TEXT,
  time_limit       INTEGER DEFAULT 60,
  sent_to_students BOOLEAN DEFAULT false,
  sent_at          TIMESTAMP,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE generated_mcqs IS 'AI-generated MCQs awaiting teacher approval and activation';


-- ─── SECTION 3: RESOURCES & RAG ─────────────────────────────

-- Resources stored in file storage (Supabase Storage / MinIO on DGX)
CREATE TABLE IF NOT EXISTS resources (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id           VARCHAR NOT NULL,    -- 6-char session code (not FK to sessions.id)
  teacher_id           TEXT,
  title                VARCHAR NOT NULL,
  description          TEXT,
  resource_type        VARCHAR NOT NULL,    -- 'pdf', 'ppt', 'doc', 'url', etc.
  file_path            TEXT NOT NULL,       -- storage path
  file_url             TEXT NOT NULL,       -- public URL
  file_name            VARCHAR,
  file_size            INTEGER,             -- bytes
  mime_type            VARCHAR,
  is_downloadable      BOOLEAN DEFAULT true,
  is_public            BOOLEAN DEFAULT false,
  view_count           INTEGER DEFAULT 0,
  download_count       INTEGER DEFAULT 0,
  is_vectorized        BOOLEAN DEFAULT false,
  vectorization_status VARCHAR DEFAULT 'pending',
  chunk_count          INTEGER DEFAULT 0,
  last_vectorized_at   TIMESTAMP,
  created_at           TIMESTAMP DEFAULT now(),
  updated_at           TIMESTAMP DEFAULT now(),
  summary              TEXT,               -- AI-generated summary
  summary_generated_at TIMESTAMP,
  extractive_keywords  TEXT[],             -- GIN-indexed keyword array
  topic_tags           TEXT[]
);

COMMENT ON COLUMN resources.summary IS 'AI-generated summary of the resource content';
COMMENT ON COLUMN resources.extractive_keywords IS 'Extracted keywords for fast topic filtering';
COMMENT ON COLUMN resources.topic_tags IS 'Topic tags for categorization';


-- Resource text chunks for RAG pipeline (depends on resources)
CREATE TABLE IF NOT EXISTS resource_chunks (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id        UUID NOT NULL REFERENCES resources(id),
  chunk_index        INTEGER NOT NULL,
  chunk_text         TEXT NOT NULL,
  token_count        INTEGER,
  page_number        INTEGER,
  section_title      VARCHAR,
  pinecone_vector_id VARCHAR NOT NULL UNIQUE,  -- vector store ID (Pinecone or Qdrant on DGX)
  created_at         TIMESTAMP DEFAULT now(),
  UNIQUE (resource_id, chunk_index)
);


-- Resource access logs (depends on resources, users)
CREATE TABLE IF NOT EXISTS resource_access_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id      UUID NOT NULL REFERENCES resources(id),
  student_id       VARCHAR NOT NULL REFERENCES users(id),
  action           VARCHAR NOT NULL,       -- 'view', 'download', 'search'
  accessed_at      TIMESTAMP DEFAULT now(),
  search_query     TEXT,                   -- if action = 'search'
  similarity_score DOUBLE PRECISION        -- cosine similarity from vector search
);


-- Files uploaded via Cloudinary (depends on sessions.session_id, users)
-- NOTE: FK references sessions.session_id (varchar), not sessions.id (int)
CREATE TABLE IF NOT EXISTS uploaded_resources (
  id              SERIAL PRIMARY KEY,
  session_id      VARCHAR NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  teacher_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR NOT NULL,
  description     TEXT,
  resource_type   VARCHAR NOT NULL,        -- 'pdf', 'ppt', 'doc', 'url', 'image', 'excel', 'zip', 'other'
  file_url        TEXT NOT NULL,           -- Cloudinary URL or external URL
  file_name       VARCHAR,
  file_size       INTEGER,                 -- bytes; NULL for URL-type resources
  mime_type       VARCHAR,
  is_downloadable BOOLEAN DEFAULT true,
  view_count      INTEGER DEFAULT 0,
  download_count  INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  uploaded_resources IS 'Stores metadata for files uploaded via Cloudinary by teachers';
COMMENT ON COLUMN uploaded_resources.resource_type IS 'Type: pdf, ppt, doc, url, image, excel, zip, other';
COMMENT ON COLUMN uploaded_resources.file_url IS 'Cloudinary URL or external URL for link resources';


-- Query classification cache (no FK deps)
CREATE TABLE IF NOT EXISTS query_classifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        VARCHAR NOT NULL,
  query_text        TEXT NOT NULL,
  query_hash        VARCHAR(64) NOT NULL,
  query_type        VARCHAR NOT NULL,
  extracted_entities JSONB,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (query_hash, session_id)
);

COMMENT ON TABLE query_classifications IS 'Caches query classifications to avoid re-processing identical queries';


-- ─── SECTION 4: TRANSCRIPTION ────────────────────────────────

-- Audio recording sessions (no FK deps)
CREATE TABLE IF NOT EXISTS transcription_sessions (
  id               SERIAL PRIMARY KEY,
  session_id       VARCHAR(255) NOT NULL,  -- allows duplicates (multiple recordings per session)
  segment_interval INTEGER NOT NULL,       -- minutes between webhook posts
  start_time       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time         TIMESTAMP,
  is_paused        BOOLEAN DEFAULT false,
  pdf_uploaded     BOOLEAN DEFAULT false,
  pdf_filename     VARCHAR(500),
  status           VARCHAR(50) DEFAULT 'active',  -- 'active', 'paused', 'stopped'
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  transcription_sessions IS 'Tracks audio recording sessions with timer intervals for webhook posting';
COMMENT ON COLUMN transcription_sessions.segment_interval IS 'Minutes between automatic webhook posts of accumulated transcripts';


-- Individual transcript segments (depends on transcription_sessions)
CREATE TABLE IF NOT EXISTS transcripts (
  id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_db_id     INTEGER NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
  segment_text      TEXT NOT NULL,
  timestamp         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_to_webhook   BOOLEAN DEFAULT false,
  detected_language VARCHAR(10),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  transcripts IS 'Stores individual transcript segments from GPU transcription server';
COMMENT ON COLUMN transcripts.sent_to_webhook IS 'True if this segment was included in a webhook post';


-- ─── SECTION 5: GAMIFICATION ─────────────────────────────────

-- Points per poll or session (depends on sessions, polls)
CREATE TABLE IF NOT EXISTS student_points (
  id          SERIAL PRIMARY KEY,
  student_id  VARCHAR NOT NULL,
  session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  poll_id     INTEGER REFERENCES polls(id) ON DELETE SET NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  point_type  VARCHAR NOT NULL,  -- 'correct_answer','fast_response','streak_bonus','first_responder','perfect_session', etc.
  earned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Prevent duplicate poll-level awards
  CONSTRAINT unique_poll_points UNIQUE (student_id, poll_id, point_type)
);


-- Achievement badges (depends on sessions)
CREATE TABLE IF NOT EXISTS student_badges (
  id               SERIAL PRIMARY KEY,
  student_id       VARCHAR NOT NULL,
  badge_type       VARCHAR NOT NULL,   -- 'first_responder','perfect_score','streak_3','streak_5','streak_10','participation_star','accuracy_master'
  badge_name       VARCHAR NOT NULL,
  badge_description TEXT,
  earned_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id       INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  badge_tier       VARCHAR DEFAULT 'bronze',  -- 'bronze','silver','gold'
  badge_category   VARCHAR
);


-- Global cross-session streaks (legacy — superseded by session_streaks)
CREATE TABLE IF NOT EXISTS student_streaks (
  id              SERIAL PRIMARY KEY,
  student_id      VARCHAR NOT NULL UNIQUE,
  current_streak  INTEGER DEFAULT 0,
  max_streak      INTEGER DEFAULT 0,
  last_correct_at TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- XP persistent progression across sessions (depends on sessions)
CREATE TABLE IF NOT EXISTS student_xp (
  id         SERIAL PRIMARY KEY,
  student_id VARCHAR NOT NULL,
  xp_amount  INTEGER NOT NULL,
  xp_type    VARCHAR NOT NULL,  -- 'session_participation','session_top3','perfect_session','weekly_consistency','resource_engagement','knowledge_card'
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  earned_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_xp UNIQUE (student_id, session_id, xp_type)
);


-- Session-scoped streaks (depends on sessions)
CREATE TABLE IF NOT EXISTS session_streaks (
  id             SERIAL PRIMARY KEY,
  student_id     VARCHAR NOT NULL,
  session_id     INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  max_streak     INTEGER DEFAULT 0,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_streak UNIQUE (student_id, session_id)
);


-- Post-session report cards (depends on sessions)
CREATE TABLE IF NOT EXISTS session_summaries (
  id                 SERIAL PRIMARY KEY,
  student_id         VARCHAR NOT NULL,
  session_id         INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  rank               INTEGER,
  total_participants INTEGER,
  accuracy           NUMERIC(5, 2),
  points_earned      INTEGER DEFAULT 0,
  xp_gained          INTEGER DEFAULT 0,
  badges_earned      TEXT[] DEFAULT '{}',
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_summary UNIQUE (student_id, session_id)
);


-- ─── SECTION 6: ATTENDANCE ───────────────────────────────────

-- Live attendance windows (depends on sessions, users)
CREATE TABLE IF NOT EXISTS session_attendance_windows (
  id               SERIAL PRIMARY KEY,
  session_id       INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL DEFAULT 60,
  opened_by        VARCHAR NOT NULL REFERENCES users(id),
  opened_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at        TIMESTAMP,
  is_active        BOOLEAN NOT NULL DEFAULT true
);


-- ─── SECTION 7: COMMUNITY ────────────────────────────────────

-- Discussion board tickets (depends on sessions, users)
CREATE TABLE IF NOT EXISTS community_tickets (
  id           SERIAL PRIMARY KEY,
  session_id   INTEGER REFERENCES sessions(id) ON DELETE CASCADE,  -- NULL for global tickets
  subject      VARCHAR(100),                                        -- NULL for session-scoped tickets
  author_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  status       VARCHAR NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Either session-scoped OR subject-scoped, never both
  CONSTRAINT chk_ticket_scope CHECK (
    (session_id IS NOT NULL AND subject IS NULL)
    OR (session_id IS NULL AND subject IS NOT NULL)
  )
);


-- Replies to community tickets (depends on community_tickets, users)
CREATE TABLE IF NOT EXISTS community_replies (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  author_id   VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_solution BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Upvotes on tickets — one per user per ticket (depends on community_tickets, users)
CREATE TABLE IF NOT EXISTS community_upvotes (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ticket_id, user_id)
);


-- ─── SECTION 8: AI STUDY ASSISTANT ───────────────────────────

-- AI chat conversation threads (depends on users)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR NOT NULL,
  student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active  BOOLEAN DEFAULT true
);


-- Individual messages in conversations (depends on ai_conversations)
CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  message_type    VARCHAR DEFAULT 'text',
  metadata        JSONB,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Student doubts flagged from AI messages (depends on ai_messages, users)
CREATE TABLE IF NOT EXISTS ai_doubts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  session_id  VARCHAR NOT NULL,
  student_id  VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doubt_text  TEXT NOT NULL,
  status      VARCHAR DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
  resolved_by VARCHAR REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Aggregated study behaviour per student per session (depends on users)
CREATE TABLE IF NOT EXISTS ai_study_analytics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id            VARCHAR NOT NULL,
  total_queries         INTEGER DEFAULT 0,
  topics_explored       TEXT[],
  resources_referenced  UUID[],
  last_query_at         TIMESTAMP,
  study_duration_minutes INTEGER DEFAULT 0,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, session_id)
);


-- ─── SECTION 9: SESSION NOTES ────────────────────────────────

-- Auto-generated session notes (depends on sessions)
CREATE TABLE IF NOT EXISTS session_notes (
  id                      SERIAL PRIMARY KEY,
  session_id              INTEGER NOT NULL REFERENCES sessions(id),
  status                  VARCHAR NOT NULL DEFAULT 'generating',  -- 'generating','completed','failed'
  notes_url               TEXT,
  storage_path            TEXT,
  transcript_length       INTEGER,
  resource_count          INTEGER,
  generation_started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generation_completed_at TIMESTAMP,
  error_message           TEXT
);


-- ─── SECTION 10: KNOWLEDGE CARDS ─────────────────────────────

-- Knowledge card activity rounds (depends on sessions)
CREATE TABLE IF NOT EXISTS knowledge_card_rounds (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  teacher_id  VARCHAR NOT NULL,
  status      VARCHAR DEFAULT 'draft' CHECK (status IN ('draft', 'distributed', 'active', 'completed')),
  total_pairs INTEGER DEFAULT 0,
  topic       VARCHAR,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Q&A card pairs within a round (depends on knowledge_card_rounds)
CREATE TABLE IF NOT EXISTS knowledge_card_pairs (
  id                 SERIAL PRIMARY KEY,
  round_id           INTEGER REFERENCES knowledge_card_rounds(id) ON DELETE CASCADE,
  question_text      TEXT NOT NULL,
  answer_text        TEXT NOT NULL,
  difficulty         INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  status             VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revealed', 'completed', 'skipped')),
  question_holder_id VARCHAR,              -- student assigned the question card
  answer_holder_id   VARCHAR,              -- student assigned the answer card
  order_index        INTEGER DEFAULT 0,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Votes on knowledge card answers (depends on knowledge_card_pairs)
CREATE TABLE IF NOT EXISTS knowledge_card_votes (
  id         SERIAL PRIMARY KEY,
  pair_id    INTEGER REFERENCES knowledge_card_pairs(id) ON DELETE CASCADE,
  student_id VARCHAR NOT NULL,
  vote       VARCHAR NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_kc_vote UNIQUE (pair_id, student_id)
);

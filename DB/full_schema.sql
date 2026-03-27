-- ============================================================
-- full_schema.sql
-- Complete SAS Edu AI database schema — single file version
-- Combines 00_extensions + 01_tables + 02_indexes + 03_triggers
--
-- Usage (local PostgreSQL):
--   psql -U postgres -d saseduai -f full_schema.sql
--
-- Usage (Docker):
--   docker exec -i <postgres_container> psql -U saseduai -d saseduai < full_schema.sql
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════
-- TABLES (in dependency order)
-- ════════════════════════════════════════════════════════════

-- ─── SECTION 1: CORE ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                  VARCHAR PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS sessions (
  id                  SERIAL PRIMARY KEY,
  session_id          VARCHAR NOT NULL UNIQUE,
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
  attendance_status    VARCHAR,
  attendance_marked_at TIMESTAMP,
  UNIQUE (session_id, student_id)
);

-- ─── SECTION 2: POLLS ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS polls (
  id             SERIAL PRIMARY KEY,
  session_id     INTEGER REFERENCES sessions(id),
  question       TEXT NOT NULL,
  options        JSONB NOT NULL,
  correct_answer INTEGER,
  justification  TEXT,
  time_limit     INTEGER DEFAULT 60,
  is_active      BOOLEAN DEFAULT false,
  queue_status   VARCHAR DEFAULT 'manual' CHECK (queue_status IN ('manual', 'queued', 'active', 'completed')),
  queue_position INTEGER,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  activated_at   TIMESTAMP,
  completed_at   TIMESTAMP,
  ends_at        TIMESTAMP,
  difficulty     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS poll_responses (
  id              SERIAL PRIMARY KEY,
  poll_id         INTEGER REFERENCES polls(id),
  student_id      VARCHAR REFERENCES users(id),
  selected_option INTEGER NOT NULL,
  is_correct      BOOLEAN,
  response_time   INTEGER,
  responded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_id, student_id)
);

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

-- ─── SECTION 3: RESOURCES & RAG ─────────────────────────────

CREATE TABLE IF NOT EXISTS resources (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id           VARCHAR NOT NULL,
  teacher_id           TEXT,
  title                VARCHAR NOT NULL,
  description          TEXT,
  resource_type        VARCHAR NOT NULL,
  file_path            TEXT NOT NULL,
  file_url             TEXT NOT NULL,
  file_name            VARCHAR,
  file_size            INTEGER,
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
  summary              TEXT,
  summary_generated_at TIMESTAMP,
  extractive_keywords  TEXT[],
  topic_tags           TEXT[]
);

CREATE TABLE IF NOT EXISTS resource_chunks (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id        UUID NOT NULL REFERENCES resources(id),
  chunk_index        INTEGER NOT NULL,
  chunk_text         TEXT NOT NULL,
  token_count        INTEGER,
  page_number        INTEGER,
  section_title      VARCHAR,
  pinecone_vector_id VARCHAR NOT NULL UNIQUE,
  created_at         TIMESTAMP DEFAULT now(),
  UNIQUE (resource_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS resource_access_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id      UUID NOT NULL REFERENCES resources(id),
  student_id       VARCHAR NOT NULL REFERENCES users(id),
  action           VARCHAR NOT NULL,
  accessed_at      TIMESTAMP DEFAULT now(),
  search_query     TEXT,
  similarity_score DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS uploaded_resources (
  id              SERIAL PRIMARY KEY,
  session_id      VARCHAR NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  teacher_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR NOT NULL,
  description     TEXT,
  resource_type   VARCHAR NOT NULL,
  file_url        TEXT NOT NULL,
  file_name       VARCHAR,
  file_size       INTEGER,
  mime_type       VARCHAR,
  is_downloadable BOOLEAN DEFAULT true,
  view_count      INTEGER DEFAULT 0,
  download_count  INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS query_classifications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id         VARCHAR NOT NULL,
  query_text         TEXT NOT NULL,
  query_hash         VARCHAR(64) NOT NULL,
  query_type         VARCHAR NOT NULL,
  extracted_entities JSONB,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (query_hash, session_id)
);

-- ─── SECTION 4: TRANSCRIPTION ────────────────────────────────

CREATE TABLE IF NOT EXISTS transcription_sessions (
  id               SERIAL PRIMARY KEY,
  session_id       VARCHAR(255) NOT NULL,
  segment_interval INTEGER NOT NULL,
  start_time       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time         TIMESTAMP,
  is_paused        BOOLEAN DEFAULT false,
  pdf_uploaded     BOOLEAN DEFAULT false,
  pdf_filename     VARCHAR(500),
  status           VARCHAR(50) DEFAULT 'active',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcripts (
  id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  session_db_id     INTEGER NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
  segment_text      TEXT NOT NULL,
  timestamp         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_to_webhook   BOOLEAN DEFAULT false,
  detected_language VARCHAR(10),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── SECTION 5: GAMIFICATION ─────────────────────────────────

CREATE TABLE IF NOT EXISTS student_points (
  id         SERIAL PRIMARY KEY,
  student_id VARCHAR NOT NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  poll_id    INTEGER REFERENCES polls(id) ON DELETE SET NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  point_type VARCHAR NOT NULL,
  earned_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_poll_points UNIQUE (student_id, poll_id, point_type)
);

CREATE TABLE IF NOT EXISTS student_badges (
  id                SERIAL PRIMARY KEY,
  student_id        VARCHAR NOT NULL,
  badge_type        VARCHAR NOT NULL,
  badge_name        VARCHAR NOT NULL,
  badge_description TEXT,
  earned_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id        INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  badge_tier        VARCHAR DEFAULT 'bronze',
  badge_category    VARCHAR
);

CREATE TABLE IF NOT EXISTS student_streaks (
  id              SERIAL PRIMARY KEY,
  student_id      VARCHAR NOT NULL UNIQUE,
  current_streak  INTEGER DEFAULT 0,
  max_streak      INTEGER DEFAULT 0,
  last_correct_at TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_xp (
  id         SERIAL PRIMARY KEY,
  student_id VARCHAR NOT NULL,
  xp_amount  INTEGER NOT NULL,
  xp_type    VARCHAR NOT NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  earned_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_xp UNIQUE (student_id, session_id, xp_type)
);

CREATE TABLE IF NOT EXISTS session_streaks (
  id             SERIAL PRIMARY KEY,
  student_id     VARCHAR NOT NULL,
  session_id     INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  max_streak     INTEGER DEFAULT 0,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_streak UNIQUE (student_id, session_id)
);

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

CREATE TABLE IF NOT EXISTS community_tickets (
  id           SERIAL PRIMARY KEY,
  session_id   INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  subject      VARCHAR(100),
  author_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  status       VARCHAR NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ticket_scope CHECK (
    (session_id IS NOT NULL AND subject IS NULL)
    OR (session_id IS NULL AND subject IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS community_replies (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  author_id   VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_solution BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_upvotes (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ticket_id, user_id)
);

-- ─── SECTION 8: AI STUDY ASSISTANT ───────────────────────────

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR NOT NULL,
  student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active  BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  message_type    VARCHAR DEFAULT 'text',
  metadata        JSONB,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS ai_study_analytics (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id             VARCHAR NOT NULL,
  total_queries          INTEGER DEFAULT 0,
  topics_explored        TEXT[],
  resources_referenced   UUID[],
  last_query_at          TIMESTAMP,
  study_duration_minutes INTEGER DEFAULT 0,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, session_id)
);

-- ─── SECTION 9: SESSION NOTES ────────────────────────────────

CREATE TABLE IF NOT EXISTS session_notes (
  id                      SERIAL PRIMARY KEY,
  session_id              INTEGER NOT NULL REFERENCES sessions(id),
  status                  VARCHAR NOT NULL DEFAULT 'generating',
  notes_url               TEXT,
  storage_path            TEXT,
  transcript_length       INTEGER,
  resource_count          INTEGER,
  generation_started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generation_completed_at TIMESTAMP,
  error_message           TEXT
);

-- ─── SECTION 10: KNOWLEDGE CARDS ─────────────────────────────

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

CREATE TABLE IF NOT EXISTS knowledge_card_pairs (
  id                 SERIAL PRIMARY KEY,
  round_id           INTEGER REFERENCES knowledge_card_rounds(id) ON DELETE CASCADE,
  question_text      TEXT NOT NULL,
  answer_text        TEXT NOT NULL,
  difficulty         INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  status             VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revealed', 'completed', 'skipped')),
  question_holder_id VARCHAR,
  answer_holder_id   VARCHAR,
  order_index        INTEGER DEFAULT 0,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_card_votes (
  id         SERIAL PRIMARY KEY,
  pair_id    INTEGER REFERENCES knowledge_card_pairs(id) ON DELETE CASCADE,
  student_id VARCHAR NOT NULL,
  vote       VARCHAR NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_kc_vote UNIQUE (pair_id, student_id)
);


-- ════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth_id           ON users(oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_register_number    ON users(register_number);
CREATE INDEX IF NOT EXISTS idx_users_role               ON users(role);

CREATE INDEX IF NOT EXISTS idx_sessions_is_active       ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id      ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_id      ON sessions(teacher_id);

CREATE INDEX IF NOT EXISTS idx_sp_session_id            ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_sp_student_id            ON session_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_sp_is_active             ON session_participants(is_active);
CREATE INDEX IF NOT EXISTS idx_sp_session_attendance    ON session_participants(session_id, attendance_status);
CREATE INDEX IF NOT EXISTS idx_sp_session_active        ON session_participants(session_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_polls_session_id         ON polls(session_id);
CREATE INDEX IF NOT EXISTS idx_polls_is_active          ON polls(is_active);
CREATE INDEX IF NOT EXISTS idx_polls_queue_status       ON polls(queue_status);
CREATE INDEX IF NOT EXISTS idx_polls_queue_position     ON polls(queue_position);
CREATE INDEX IF NOT EXISTS idx_polls_created_at         ON polls(created_at);
CREATE INDEX IF NOT EXISTS idx_polls_active_ends        ON polls(is_active, ends_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_polls_session_active     ON polls(session_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pr_poll_id               ON poll_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_pr_student_id            ON poll_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_pr_responded_at          ON poll_responses(responded_at);

CREATE INDEX IF NOT EXISTS idx_gmcq_session_id          ON generated_mcqs(session_id);
CREATE INDEX IF NOT EXISTS idx_gmcq_sent                ON generated_mcqs(sent_to_students);
CREATE INDEX IF NOT EXISTS idx_gmcq_created_at          ON generated_mcqs(created_at);

CREATE INDEX IF NOT EXISTS idx_resources_session_id     ON resources(session_id);
CREATE INDEX IF NOT EXISTS idx_resources_teacher_id     ON resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_resources_type           ON resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_vectorized     ON resources(is_vectorized);
CREATE INDEX IF NOT EXISTS idx_resources_sess_vec       ON resources(session_id, is_vectorized);
CREATE INDEX IF NOT EXISTS idx_resources_keywords       ON resources USING GIN(extractive_keywords);

CREATE INDEX IF NOT EXISTS idx_chunks_resource_id       ON resource_chunks(resource_id);
CREATE INDEX IF NOT EXISTS idx_chunks_vector_id         ON resource_chunks(pinecone_vector_id);

CREATE INDEX IF NOT EXISTS idx_ral_resource_id          ON resource_access_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_ral_student_id           ON resource_access_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_ral_action               ON resource_access_logs(action);

CREATE INDEX IF NOT EXISTS idx_ur_session_id            ON uploaded_resources(session_id);
CREATE INDEX IF NOT EXISTS idx_ur_teacher_id            ON uploaded_resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ur_type                  ON uploaded_resources(resource_type);

CREATE INDEX IF NOT EXISTS idx_qc_session_id            ON query_classifications(session_id);
CREATE INDEX IF NOT EXISTS idx_qc_hash                  ON query_classifications(query_hash);

CREATE INDEX IF NOT EXISTS idx_ts_session_id            ON transcription_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ts_status                ON transcription_sessions(status);

CREATE INDEX IF NOT EXISTS idx_tr_session_db_id         ON transcripts(session_db_id);
CREATE INDEX IF NOT EXISTS idx_tr_sent                  ON transcripts(sent_to_webhook);
CREATE INDEX IF NOT EXISTS idx_tr_session_sent          ON transcripts(session_db_id, sent_to_webhook);

CREATE INDEX IF NOT EXISTS idx_sp2_student_id           ON student_points(student_id);
CREATE INDEX IF NOT EXISTS idx_sp2_session_id           ON student_points(session_id);
CREATE INDEX IF NOT EXISTS idx_sp2_student_session      ON student_points(student_id, session_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_session_level_points
  ON student_points(student_id, session_id, point_type) WHERE poll_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sb_student_id            ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_sb_session_id            ON student_badges(session_id);

CREATE INDEX IF NOT EXISTS idx_sstr_student_id          ON student_streaks(student_id);

CREATE INDEX IF NOT EXISTS idx_sxp_student_id           ON student_xp(student_id);
CREATE INDEX IF NOT EXISTS idx_sxp_session_id           ON student_xp(session_id);

CREATE INDEX IF NOT EXISTS idx_ss_student_session       ON session_streaks(student_id, session_id);

CREATE INDEX IF NOT EXISTS idx_ssum_student_id          ON session_summaries(student_id);
CREATE INDEX IF NOT EXISTS idx_ssum_session_id          ON session_summaries(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_window_per_session
  ON session_attendance_windows(session_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_saw_session_active       ON session_attendance_windows(session_id, is_active);
CREATE INDEX IF NOT EXISTS idx_saw_opened_by            ON session_attendance_windows(opened_by);

CREATE INDEX IF NOT EXISTS idx_ct_session_id            ON community_tickets(session_id);
CREATE INDEX IF NOT EXISTS idx_ct_author_id             ON community_tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_ct_status                ON community_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ct_upvotes               ON community_tickets(upvote_count DESC);
CREATE INDEX IF NOT EXISTS idx_ct_subject               ON community_tickets(subject) WHERE session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cr_ticket_id             ON community_replies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_cr_author_id             ON community_replies(author_id);

CREATE INDEX IF NOT EXISTS idx_cu_ticket_id             ON community_upvotes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_cu_user_id               ON community_upvotes(user_id);

CREATE INDEX IF NOT EXISTS idx_ac_student_session       ON ai_conversations(student_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ac_session_created       ON ai_conversations(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_am_conv_created          ON ai_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ad_session_status        ON ai_doubts(session_id, status);
CREATE INDEX IF NOT EXISTS idx_ad_student_created       ON ai_doubts(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_message_id            ON ai_doubts(message_id);
CREATE INDEX IF NOT EXISTS idx_ad_resolved_by           ON ai_doubts(resolved_by);

CREATE INDEX IF NOT EXISTS idx_asa_student_id           ON ai_study_analytics(student_id);

CREATE INDEX IF NOT EXISTS idx_sn_session_id            ON session_notes(session_id);

CREATE INDEX IF NOT EXISTS idx_kcr_session_id           ON knowledge_card_rounds(session_id);

CREATE INDEX IF NOT EXISTS idx_kcp_round_id             ON knowledge_card_pairs(round_id);
CREATE INDEX IF NOT EXISTS idx_kcp_question_holder      ON knowledge_card_pairs(question_holder_id);
CREATE INDEX IF NOT EXISTS idx_kcp_answer_holder        ON knowledge_card_pairs(answer_holder_id);

CREATE INDEX IF NOT EXISTS idx_kcv_pair_id              ON knowledge_card_votes(pair_id);


-- ════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_transcription_sessions_updated_at ON transcription_sessions;
CREATE TRIGGER update_transcription_sessions_updated_at
  BEFORE UPDATE ON transcription_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_uploaded_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_uploaded_resources_updated_at ON uploaded_resources;
CREATE TRIGGER trigger_update_uploaded_resources_updated_at
  BEFORE UPDATE ON uploaded_resources
  FOR EACH ROW EXECUTE FUNCTION update_uploaded_resources_updated_at();

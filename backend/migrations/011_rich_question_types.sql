-- Migration 011: Rich Question Types
-- Adds support for multiple question types, LaTeX, images, solution steps,
-- subject tagging, Bloom's taxonomy, and passage clusters.

-- ── polls table ────────────────────────────────────────────────────────────────
ALTER TABLE polls
  ADD COLUMN IF NOT EXISTS question_type      VARCHAR(30)   DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS question_image_url TEXT,
  ADD COLUMN IF NOT EXISTS question_latex      TEXT,
  ADD COLUMN IF NOT EXISTS options_metadata    JSONB,
  ADD COLUMN IF NOT EXISTS solution_steps      JSONB,
  ADD COLUMN IF NOT EXISTS subject_tag         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS difficulty_level    VARCHAR(20)   DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS marks               INTEGER       DEFAULT 1,
  ADD COLUMN IF NOT EXISTS blooms_level        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS topic               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sub_topic           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cluster_id          INTEGER;

-- ── poll_responses table ───────────────────────────────────────────────────────
ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS answer_data JSONB;

-- ── sessions table ─────────────────────────────────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS subject      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subject_tags VARCHAR(50)[];

-- ── generated_mcqs table ───────────────────────────────────────────────────────
ALTER TABLE generated_mcqs
  ADD COLUMN IF NOT EXISTS question_type      VARCHAR(30)   DEFAULT 'mcq',
  ADD COLUMN IF NOT EXISTS question_image_url TEXT,
  ADD COLUMN IF NOT EXISTS question_latex      TEXT,
  ADD COLUMN IF NOT EXISTS options_metadata    JSONB,
  ADD COLUMN IF NOT EXISTS solution_steps      JSONB,
  ADD COLUMN IF NOT EXISTS subject_tag         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS difficulty_level    VARCHAR(20)   DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS blooms_level        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS topic               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS exam_tags           VARCHAR(50)[];

-- ── poll_clusters table (passage / case-study clusters) ───────────────────────
CREATE TABLE IF NOT EXISTS poll_clusters (
  id                  SERIAL PRIMARY KEY,
  session_id          VARCHAR(10),
  title               VARCHAR(255),
  passage             TEXT,
  passage_image_url   TEXT,
  passage_latex       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from polls to poll_clusters once the table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_poll_cluster'
      AND table_name = 'polls'
  ) THEN
    ALTER TABLE polls
      ADD CONSTRAINT fk_poll_cluster
      FOREIGN KEY (cluster_id) REFERENCES poll_clusters(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ── indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_polls_question_type   ON polls(question_type);
CREATE INDEX IF NOT EXISTS idx_polls_subject_tag     ON polls(subject_tag);
CREATE INDEX IF NOT EXISTS idx_polls_cluster_id      ON polls(cluster_id);
CREATE INDEX IF NOT EXISTS idx_sessions_subject      ON sessions(subject);

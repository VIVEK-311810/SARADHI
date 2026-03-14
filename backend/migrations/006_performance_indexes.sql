-- Migration 006: Performance indexes for enterprise scale
-- Fixes missing indexes identified in production audit (2026-02-18)

-- ─── session_participants ────────────────────────────────────────────────────
-- Used in: student dashboard, heartbeat, cleanup, gamification, leaderboard
CREATE INDEX IF NOT EXISTS idx_session_participants_student_id
  ON session_participants(student_id);

-- Used in: participant count queries per session
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id_active
  ON session_participants(session_id, is_active)
  WHERE is_active = true;

-- ─── poll_responses ──────────────────────────────────────────────────────────
-- Critical: duplicate response check (SELECT before INSERT)
-- Without this, every poll response does a full table scan
ALTER TABLE poll_responses
  DROP CONSTRAINT IF EXISTS poll_responses_poll_student_unique;
ALTER TABLE poll_responses
  ADD CONSTRAINT poll_responses_poll_student_unique
  UNIQUE (poll_id, student_id);

-- Used in: gamification, analytics, leaderboard
CREATE INDEX IF NOT EXISTS idx_poll_responses_student_id
  ON poll_responses(student_id);

-- Used in: response count per poll
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_id
  ON poll_responses(poll_id);

-- ─── polls ───────────────────────────────────────────────────────────────────
-- Used in: get active poll, session management
CREATE INDEX IF NOT EXISTS idx_polls_session_id_active
  ON polls(session_id, is_active)
  WHERE is_active = true;

-- Used in: all polls per session
CREATE INDEX IF NOT EXISTS idx_polls_session_id
  ON polls(session_id);

-- ─── sessions ────────────────────────────────────────────────────────────────
-- Used in: teacher dashboard, analytics
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_id
  ON sessions(teacher_id);

-- Used in: join by code (already likely has this, but ensure)
CREATE INDEX IF NOT EXISTS idx_sessions_session_id
  ON sessions(session_id);

-- ─── student_points ──────────────────────────────────────────────────────────
-- Used in: leaderboard, student stats, gamification
CREATE INDEX IF NOT EXISTS idx_student_points_student_id
  ON student_points(student_id);

CREATE INDEX IF NOT EXISTS idx_student_points_session_id
  ON student_points(session_id);

CREATE INDEX IF NOT EXISTS idx_student_points_student_session
  ON student_points(student_id, session_id);

-- ─── student_streaks ─────────────────────────────────────────────────────────
-- Used in: gamification points calculation (upsert)
-- student_id should already be PK or have unique constraint
CREATE INDEX IF NOT EXISTS idx_student_streaks_student_id
  ON student_streaks(student_id);

-- ─── student_badges ──────────────────────────────────────────────────────────
-- Used in: badge queries per student
CREATE INDEX IF NOT EXISTS idx_student_badges_student_id
  ON student_badges(student_id);

-- ─── resources (Supabase) ───────────────────────────────────────────────────
-- NOTE: Supabase/PostgreSQL indexes — run these in Supabase SQL editor if needed
-- CREATE INDEX IF NOT EXISTS idx_resources_session_id ON resources(session_id);
-- CREATE INDEX IF NOT EXISTS idx_resources_session_vectorized ON resources(session_id, is_vectorized);

-- ─── transcription_sessions ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transcription_sessions_session_id
  ON transcription_sessions(session_id);

-- ─── transcripts ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transcripts_session_id
  ON transcripts(session_id);

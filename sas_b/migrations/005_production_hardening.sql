-- Migration 005: Production hardening — poll persistence + performance indexes

-- Add ends_at to polls so active polls survive server restarts
ALTER TABLE polls ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP;

-- Index for quickly finding active polls that haven't expired yet
CREATE INDEX IF NOT EXISTS idx_polls_active_ends
  ON polls(is_active, ends_at)
  WHERE is_active = true;

-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_poll_responses_student
  ON poll_responses(student_id);

CREATE INDEX IF NOT EXISTS idx_sessions_teacher
  ON sessions(teacher_id);

CREATE INDEX IF NOT EXISTS idx_student_points_student
  ON student_points(student_id);

CREATE INDEX IF NOT EXISTS idx_resources_session_id
  ON resources(session_id);

CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_id
  ON poll_responses(poll_id);

CREATE INDEX IF NOT EXISTS idx_session_participants_student
  ON session_participants(student_id);

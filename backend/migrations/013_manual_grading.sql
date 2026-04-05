-- Migration 013: Add manual grading columns to poll_responses
-- Needed for essay / short_answer question types where is_correct is null
-- until a teacher reviews and grades the response.

ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
  ADD COLUMN IF NOT EXISTS graded_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graded_by        VARCHAR REFERENCES users(id) ON DELETE SET NULL;

-- Index to quickly find ungraded essay/short_answer responses per poll
CREATE INDEX IF NOT EXISTS idx_poll_responses_ungraded
  ON poll_responses (poll_id)
  WHERE is_correct IS NULL;

-- Migration 014: Student confidence rating on poll responses
-- Adds a confidence column so students can self-report how sure they were.

ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS confidence VARCHAR(10)
    CHECK (confidence IN ('low', 'medium', 'high'));

-- Index for analytics queries (avg confidence per poll)
CREATE INDEX IF NOT EXISTS idx_poll_responses_confidence
  ON poll_responses (poll_id, confidence)
  WHERE confidence IS NOT NULL;

COMMENT ON COLUMN poll_responses.confidence IS
  'Student self-reported confidence after answering: low | medium | high';

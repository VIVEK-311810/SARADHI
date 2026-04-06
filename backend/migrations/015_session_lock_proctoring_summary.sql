-- Migration 015: Session lock, proctoring data, AI session summary
-- Safe to run multiple times (all IF NOT EXISTS)

-- Session lock: teacher can prevent new students from joining
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_after_minutes INTEGER;

-- Proctoring: track tab switches + focused time per poll response
ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS tab_switches INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_focused_ms INTEGER;

-- AI session summary generated after class ends
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS summary_text TEXT,
  ADD COLUMN IF NOT EXISTS summary_status VARCHAR(20) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

-- Migration 007: Live class control, attendance system, and student community
-- Run with: node run-migration-007.js

-- ─── Feature 0: Live Class Control ──────────────────────────────────────────
-- Sessions now have an is_live flag separate from is_active.
-- is_active = session exists and is usable (resources, history, etc.)
-- is_live   = teacher has explicitly started the live class streaming portion
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Feature 1: Attendance System ────────────────────────────────────────────
-- Attendance status columns on session_participants
-- NULL = attendance was never taken for this session
-- 'present' = student marked present during the attendance window
-- 'late'    = student joined after window closed, auto-flagged
-- 'absent'  = did not mark during open window
ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMP DEFAULT NULL;

-- Persist attendance windows so data survives Render cold-starts
-- Partial unique index ensures only one active window per session at a time
CREATE TABLE IF NOT EXISTS session_attendance_windows (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER NOT NULL DEFAULT 60,
  closed_at TIMESTAMP DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  opened_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_window_per_session
  ON session_attendance_windows(session_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_sp_session_attendance
  ON session_participants(session_id, attendance_status);

CREATE INDEX IF NOT EXISTS idx_attendance_window_session
  ON session_attendance_windows(session_id, is_active);

-- ─── Feature 3: Student Community ────────────────────────────────────────────
-- Community doubt tickets (session-scoped OR global with subject, never both)
CREATE TABLE IF NOT EXISTS community_tickets (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE DEFAULT NULL,
  subject VARCHAR(100) DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ticket_scope CHECK (
    (session_id IS NOT NULL AND subject IS NULL)
    OR (session_id IS NULL AND subject IS NOT NULL)
  )
);

-- Community replies
CREATE TABLE IF NOT EXISTS community_replies (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_solution BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Upvotes — unique per user per ticket (no duplicate upvotes)
CREATE TABLE IF NOT EXISTS community_upvotes (
  ticket_id INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id)
);

-- Indexes for community queries
CREATE INDEX IF NOT EXISTS idx_tickets_session_id
  ON community_tickets(session_id);

CREATE INDEX IF NOT EXISTS idx_tickets_author_id
  ON community_tickets(author_id);

CREATE INDEX IF NOT EXISTS idx_tickets_status
  ON community_tickets(status);

CREATE INDEX IF NOT EXISTS idx_tickets_subject
  ON community_tickets(subject)
  WHERE session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_upvotes
  ON community_tickets(upvote_count DESC);

CREATE INDEX IF NOT EXISTS idx_replies_ticket_id
  ON community_replies(ticket_id);

CREATE INDEX IF NOT EXISTS idx_replies_author_id
  ON community_replies(author_id);

CREATE INDEX IF NOT EXISTS idx_upvotes_ticket_id
  ON community_upvotes(ticket_id);

CREATE INDEX IF NOT EXISTS idx_upvotes_user_id
  ON community_upvotes(user_id);

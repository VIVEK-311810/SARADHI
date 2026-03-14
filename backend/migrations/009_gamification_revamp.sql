-- Migration 009: Gamification Revamp — session-scoped points, XP system, tiered badges
-- Replaces global streaks with session-scoped streaks, adds XP progression and levels

-- Student XP tracking (persistent progression across sessions)
CREATE TABLE IF NOT EXISTS student_xp (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  xp_amount INTEGER NOT NULL,
  xp_type VARCHAR(50) NOT NULL,  -- 'session_participation', 'session_top3', 'perfect_session', 'weekly_consistency', 'resource_engagement', 'knowledge_card'
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_xp UNIQUE (student_id, session_id, xp_type)
);

CREATE INDEX IF NOT EXISTS idx_student_xp_student ON student_xp(student_id);
CREATE INDEX IF NOT EXISTS idx_student_xp_session ON student_xp(session_id);

-- Session-scoped streaks (replaces global student_streaks for scoring purposes)
CREATE TABLE IF NOT EXISTS session_streaks (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  max_streak INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_streak UNIQUE (student_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_streaks_student_session ON session_streaks(student_id, session_id);

-- Session summaries (generated when teacher finalizes a session)
CREATE TABLE IF NOT EXISTS session_summaries (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  rank INTEGER,
  total_participants INTEGER,
  accuracy DECIMAL(5,2),
  points_earned INTEGER DEFAULT 0,
  xp_gained INTEGER DEFAULT 0,
  badges_earned TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_session_summary UNIQUE (student_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_student ON session_summaries(student_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);

-- Add difficulty column to polls (1=easy, 2=medium, 3=hard)
ALTER TABLE polls ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 1;

-- Add tier and category to student_badges for tiered badge system
ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS badge_tier VARCHAR(10) DEFAULT 'bronze';
ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS badge_category VARCHAR(50);

-- Add leaderboard visibility toggle to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS leaderboard_visible BOOLEAN DEFAULT false;

-- Partial unique index for session-level point awards (where poll_id IS NULL)
-- This prevents duplicate session-level awards like attendance and all_polls_answered
CREATE UNIQUE INDEX IF NOT EXISTS unique_session_level_points
  ON student_points(student_id, session_id, point_type) WHERE poll_id IS NULL;

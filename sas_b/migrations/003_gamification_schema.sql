-- Gamification Schema for Student Leaderboard & Points System
-- Run this migration to add gamification features

-- Student points tracking
CREATE TABLE IF NOT EXISTS student_points (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  poll_id INTEGER REFERENCES polls(id) ON DELETE SET NULL,
  points INTEGER NOT NULL DEFAULT 0,
  point_type VARCHAR(50) NOT NULL, -- 'correct_answer', 'fast_response', 'streak_bonus', 'first_responder', 'perfect_session'
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_poll_points UNIQUE (student_id, poll_id, point_type)
);

-- Student badges/achievements
CREATE TABLE IF NOT EXISTS student_badges (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  badge_type VARCHAR(50) NOT NULL, -- 'first_responder', 'perfect_score', 'streak_3', 'streak_5', 'streak_10', 'participation_star', 'accuracy_master'
  badge_name VARCHAR(100) NOT NULL,
  badge_description TEXT,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL
);

-- Student streaks tracking
CREATE TABLE IF NOT EXISTS student_streaks (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  current_streak INTEGER DEFAULT 0,
  max_streak INTEGER DEFAULT 0,
  last_correct_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_points_student ON student_points(student_id);
CREATE INDEX IF NOT EXISTS idx_student_points_session ON student_points(session_id);
CREATE INDEX IF NOT EXISTS idx_student_badges_student ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_student_streaks_student ON student_streaks(student_id);

-- Badge definitions reference (for documentation)
-- first_responder: First correct answer in a poll (10 bonus points)
-- perfect_score: 100% accuracy in a session with 3+ polls (100 bonus points)
-- streak_3: 3 correct answers in a row (15 bonus points)
-- streak_5: 5 correct answers in a row (30 bonus points)
-- streak_10: 10 correct answers in a row (50 bonus points)
-- participation_star: Answered all polls in a session
-- accuracy_master: 90%+ accuracy over 10+ polls

-- Migration 017: DB Hardening
-- Adds missing FK constraints, CHECK constraints, and performance indexes.
-- All constraints use NOT VALID — existing rows are not scanned; only new/updated
-- rows are validated. Run VALIDATE CONSTRAINT in a separate off-peak step.
-- DO $$ blocks guard each constraint so this is safe to re-run.

-- ─── 1. FK constraints on gamification tables ────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_student_points_student' AND table_name = 'student_points') THEN
    ALTER TABLE student_points ADD CONSTRAINT fk_student_points_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_student_badges_student' AND table_name = 'student_badges') THEN
    ALTER TABLE student_badges ADD CONSTRAINT fk_student_badges_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_student_streaks_student' AND table_name = 'student_streaks') THEN
    ALTER TABLE student_streaks ADD CONSTRAINT fk_student_streaks_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_student_xp_student' AND table_name = 'student_xp') THEN
    ALTER TABLE student_xp ADD CONSTRAINT fk_student_xp_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_session_streaks_student' AND table_name = 'session_streaks') THEN
    ALTER TABLE session_streaks ADD CONSTRAINT fk_session_streaks_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_session_summaries_student' AND table_name = 'session_summaries') THEN
    ALTER TABLE session_summaries ADD CONSTRAINT fk_session_summaries_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_competition_answers_poll' AND table_name = 'competition_answers') THEN
    ALTER TABLE competition_answers ADD CONSTRAINT fk_competition_answers_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ─── 2. CHECK constraints on value ranges ────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_polls_difficulty' AND table_name = 'polls') THEN
    ALTER TABLE polls ADD CONSTRAINT chk_polls_difficulty CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_session_summaries_accuracy' AND table_name = 'session_summaries') THEN
    ALTER TABLE session_summaries ADD CONSTRAINT chk_session_summaries_accuracy CHECK (accuracy IS NULL OR (accuracy >= 0 AND accuracy <= 100)) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_attendance_duration' AND table_name = 'session_attendance_windows') THEN
    ALTER TABLE session_attendance_windows ADD CONSTRAINT chk_attendance_duration CHECK (duration_seconds > 0) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_competition_response_time' AND table_name = 'competition_answers') THEN
    ALTER TABLE competition_answers ADD CONSTRAINT chk_competition_response_time CHECK (response_time_ms IS NULL OR response_time_ms >= 0) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_student_xp_positive' AND table_name = 'student_xp') THEN
    ALTER TABLE student_xp ADD CONSTRAINT chk_student_xp_positive CHECK (xp_amount > 0) NOT VALID;
  END IF;
END $$;

-- ─── 3. Enum-like CHECK constraints on open VARCHAR columns ──────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_student_points_type' AND table_name = 'student_points') THEN
    ALTER TABLE student_points ADD CONSTRAINT chk_student_points_type CHECK (point_type IN (
      'correct_answer', 'fast_response', 'streak_bonus',
      'first_responder', 'perfect_session', 'attendance', 'all_polls_answered'
    )) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_student_xp_type' AND table_name = 'student_xp') THEN
    ALTER TABLE student_xp ADD CONSTRAINT chk_student_xp_type CHECK (xp_type IN (
      'session_participation', 'session_top3', 'perfect_session',
      'weekly_consistency', 'resource_engagement', 'knowledge_card'
    )) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_competition_rooms_status' AND table_name = 'competition_rooms') THEN
    ALTER TABLE competition_rooms ADD CONSTRAINT chk_competition_rooms_status CHECK (status IN ('waiting', 'active', 'finished')) NOT VALID;
  END IF;
END $$;

-- ─── 4. Unique index on student_badges ───────────────────────────────────────
-- COALESCE(session_id, -1) handles NULL session_id rows in the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_badges_per_session
  ON student_badges(student_id, badge_type, COALESCE(session_id, -1));

-- ─── 5. Missing performance indexes ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_teacher_created
  ON sessions(teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poll_responses_student_responded
  ON poll_responses(student_id, responded_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_created
  ON community_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_answers_student_room
  ON competition_answers(student_id, room_id);

CREATE INDEX IF NOT EXISTS idx_student_xp_student_session
  ON student_xp(student_id, session_id);

CREATE INDEX IF NOT EXISTS idx_query_classifications_created_at
  ON query_classifications(created_at);

CREATE INDEX IF NOT EXISTS idx_student_points_student_session
  ON student_points(student_id, session_id);

-- ─── Post-deploy step (run in Supabase SQL editor, off-peak) ─────────────────
-- ALTER TABLE student_points      VALIDATE CONSTRAINT fk_student_points_student;
-- ALTER TABLE student_badges      VALIDATE CONSTRAINT fk_student_badges_student;
-- ALTER TABLE student_streaks     VALIDATE CONSTRAINT fk_student_streaks_student;
-- ALTER TABLE student_xp          VALIDATE CONSTRAINT fk_student_xp_student;
-- ALTER TABLE session_streaks     VALIDATE CONSTRAINT fk_session_streaks_student;
-- ALTER TABLE session_summaries   VALIDATE CONSTRAINT fk_session_summaries_student;
-- ALTER TABLE competition_answers VALIDATE CONSTRAINT fk_competition_answers_poll;
-- ALTER TABLE polls                VALIDATE CONSTRAINT chk_polls_difficulty;
-- ALTER TABLE session_summaries   VALIDATE CONSTRAINT chk_session_summaries_accuracy;
-- ALTER TABLE session_attendance_windows VALIDATE CONSTRAINT chk_attendance_duration;
-- ALTER TABLE competition_answers VALIDATE CONSTRAINT chk_competition_response_time;
-- ALTER TABLE student_xp          VALIDATE CONSTRAINT chk_student_xp_positive;
-- ALTER TABLE student_points      VALIDATE CONSTRAINT chk_student_points_type;
-- ALTER TABLE student_xp          VALIDATE CONSTRAINT chk_student_xp_type;
-- ALTER TABLE competition_rooms   VALIDATE CONSTRAINT chk_competition_rooms_status;

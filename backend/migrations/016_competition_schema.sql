-- Competition rooms created by students on top of teacher sessions
CREATE TABLE IF NOT EXISTS competition_rooms (
  id                     SERIAL PRIMARY KEY,
  room_code              VARCHAR(8) UNIQUE NOT NULL,
  session_id             VARCHAR(20) REFERENCES sessions(session_id) ON DELETE CASCADE,
  created_by             VARCHAR REFERENCES users(id),
  status                 VARCHAR(20) DEFAULT 'waiting',  -- waiting | active | finished
  current_question_index INTEGER DEFAULT -1,
  question_start_time    BIGINT,
  time_per_question      INTEGER DEFAULT 20,
  total_questions        INTEGER DEFAULT 0,
  teacher_question_count INTEGER DEFAULT 0,
  student_question_ids   INTEGER[],
  teacher_poll_ids       INTEGER[],
  started_at             TIMESTAMP,
  ended_at               TIMESTAMP,
  created_at             TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competition_participants (
  id                 SERIAL PRIMARY KEY,
  room_id            INTEGER REFERENCES competition_rooms(id) ON DELETE CASCADE,
  student_id         VARCHAR REFERENCES users(id),
  role               VARCHAR(10) DEFAULT 'player',  -- player | spectator
  score              INTEGER DEFAULT 0,
  correct_count      INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  joined_at          TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, student_id)
);

CREATE TABLE IF NOT EXISTS competition_answers (
  id               SERIAL PRIMARY KEY,
  room_id          INTEGER REFERENCES competition_rooms(id) ON DELETE CASCADE,
  student_id       VARCHAR REFERENCES users(id),
  poll_id          INTEGER,
  question_index   INTEGER,
  answer_index     INTEGER,
  is_correct       BOOLEAN,
  response_time_ms INTEGER,
  points_earned    INTEGER DEFAULT 0,
  answered_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, student_id, question_index)
);

-- AI-generated questions from faculty session materials, for competition use only
-- Students CANNOT write questions manually — only AI generation from faculty resources is allowed
-- This table is never mixed with the teacher-controlled polls table
CREATE TABLE IF NOT EXISTS student_questions (
  id             SERIAL PRIMARY KEY,
  session_id     VARCHAR(20) REFERENCES sessions(session_id) ON DELETE CASCADE,
  created_by     VARCHAR REFERENCES users(id),
  question       TEXT NOT NULL,
  options        JSONB NOT NULL,
  correct_answer INTEGER NOT NULL,
  justification  TEXT,
  source         VARCHAR(10) DEFAULT 'ai',  -- always 'ai' — manual creation is not permitted
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_rooms_status   ON competition_rooms(status);
CREATE INDEX IF NOT EXISTS idx_competition_rooms_session  ON competition_rooms(session_id);
CREATE INDEX IF NOT EXISTS idx_competition_participants_room ON competition_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_competition_answers_room   ON competition_answers(room_id);
CREATE INDEX IF NOT EXISTS idx_student_questions_session  ON student_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_student_questions_creator  ON student_questions(created_by);

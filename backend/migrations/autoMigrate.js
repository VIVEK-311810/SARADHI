const pool = require('../db');
const logger = require('../logger');

/**
 * Apply any missing schema changes on startup so deploys don't need manual SQL runs.
 * Each statement runs independently — one failure never blocks the rest.
 * Uses a single DB connection for all DDL to avoid hammering the pool.
 */
async function runAutoMigrations() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    logger.warn('autoMigrate: DB not reachable on startup, skipping schema sync', { error: err.message });
    return;
  }

  const run = async (sql, label) => {
    try {
      await client.query(sql);
      logger.debug(`Auto-migration OK: ${label}`);
    } catch (err) {
      logger.error(`Auto-migration FAILED (non-fatal): ${label}`, { error: err.message });
    }
  };

  // Migration 007 – live class control, attendance, community
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE`, 'sessions.is_live');
  await run(`ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20)`, 'sp.attendance_status');
  await run(`ALTER TABLE session_participants ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMP`, 'sp.attendance_marked_at');

  await run(`
    CREATE TABLE IF NOT EXISTS session_attendance_windows (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      duration_seconds INTEGER NOT NULL DEFAULT 60,
      opened_by VARCHAR NOT NULL REFERENCES users(id),
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `, 'session_attendance_windows');

  await run(`
    CREATE TABLE IF NOT EXISTS community_tickets (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      subject VARCHAR(100),
      author_id VARCHAR NOT NULL REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      upvote_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'community_tickets');

  await run(`
    CREATE TABLE IF NOT EXISTS community_replies (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
      author_id VARCHAR NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_solution BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'community_replies');

  await run(`
    CREATE TABLE IF NOT EXISTS community_upvotes (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(ticket_id, user_id)
    )
  `, 'community_upvotes');

  // Migration 008 – AI Study Assistant
  await run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(10) NOT NULL,
      student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE
    )
  `, 'ai_conversations');

  await run(`CREATE INDEX IF NOT EXISTS idx_ai_conversations_student_session ON ai_conversations(student_id, session_id)`, 'idx_ai_conversations_student_session');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      message_type VARCHAR(30) DEFAULT 'text',
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'ai_messages');

  await run(`CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at)`, 'idx_ai_messages_conversation');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_doubts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
      session_id VARCHAR(10) NOT NULL,
      student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doubt_text TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
      resolved_by VARCHAR REFERENCES users(id),
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'ai_doubts');

  await run(`CREATE INDEX IF NOT EXISTS idx_ai_doubts_session_status ON ai_doubts(session_id, status)`, 'idx_ai_doubts_session_status');

  await run(`
    CREATE TABLE IF NOT EXISTS ai_study_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id VARCHAR(10) NOT NULL,
      total_queries INTEGER DEFAULT 0,
      topics_explored TEXT[],
      resources_referenced UUID[],
      last_query_at TIMESTAMP,
      study_duration_minutes INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, session_id)
    )
  `, 'ai_study_analytics');

  await run(`ALTER TABLE resource_chunks ADD COLUMN IF NOT EXISTS section_title VARCHAR(255)`, 'resource_chunks.section_title');

  // Migration 009 – Auto Notes Generation: session live timing + notes lifecycle
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMP`, 'sessions.live_started_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMP`, 'sessions.live_ended_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_status VARCHAR(20) DEFAULT 'none'`, 'sessions.notes_status');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_url TEXT`, 'sessions.notes_url');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_generated_at TIMESTAMP`, 'sessions.notes_generated_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes_error TEXT`, 'sessions.notes_error');

  await run(`
    CREATE TABLE IF NOT EXISTS session_notes (
      id                      SERIAL PRIMARY KEY,
      session_id              INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      status                  VARCHAR(20) NOT NULL DEFAULT 'generating',
      notes_url               TEXT,
      storage_path            TEXT,
      transcript_length       INTEGER,
      resource_count          INTEGER,
      generation_started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      generation_completed_at TIMESTAMP,
      error_message           TEXT
    )
  `, 'session_notes');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id)`, 'idx_session_notes_session_id');

  // Migration 009b – Gamification Revamp: XP, session-scoped streaks, summaries
  await run(`
    CREATE TABLE IF NOT EXISTS student_xp (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      xp_amount INTEGER NOT NULL,
      xp_type VARCHAR(50) NOT NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_xp UNIQUE (student_id, session_id, xp_type)
    )
  `, 'student_xp');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_xp_student ON student_xp(student_id)`, 'idx_student_xp_student');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_xp_session ON student_xp(session_id)`, 'idx_student_xp_session');

  await run(`
    CREATE TABLE IF NOT EXISTS session_streaks (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      current_streak INTEGER DEFAULT 0,
      max_streak INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_session_streak UNIQUE (student_id, session_id)
    )
  `, 'session_streaks');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_streaks_student_session ON session_streaks(student_id, session_id)`, 'idx_session_streaks_student_session');

  await run(`
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
    )
  `, 'session_summaries');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_summaries_student ON session_summaries(student_id)`, 'idx_session_summaries_student');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id)`, 'idx_session_summaries_session');

  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 1`, 'polls.difficulty');
  await run(`ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS badge_tier VARCHAR(10) DEFAULT 'bronze'`, 'student_badges.badge_tier');
  await run(`ALTER TABLE student_badges ADD COLUMN IF NOT EXISTS badge_category VARCHAR(50)`, 'student_badges.badge_category');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS leaderboard_visible BOOLEAN DEFAULT false`, 'sessions.leaderboard_visible');
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_session_level_points
      ON student_points(student_id, session_id, point_type) WHERE poll_id IS NULL
  `, 'unique_session_level_points');

  // Migration 010 – Knowledge Cards: interactive Q&A card activity
  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_card_rounds (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      teacher_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'distributed', 'active', 'completed')),
      total_pairs INTEGER DEFAULT 0,
      topic VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'knowledge_card_rounds');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_rounds_session ON knowledge_card_rounds(session_id)`, 'idx_kc_rounds_session');

  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_card_pairs (
      id SERIAL PRIMARY KEY,
      round_id INTEGER REFERENCES knowledge_card_rounds(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revealed', 'completed', 'skipped')),
      question_holder_id VARCHAR(50),
      answer_holder_id VARCHAR(50),
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'knowledge_card_pairs');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_pairs_round ON knowledge_card_pairs(round_id)`, 'idx_kc_pairs_round');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_pairs_question_holder ON knowledge_card_pairs(question_holder_id)`, 'idx_kc_pairs_question_holder');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_pairs_answer_holder ON knowledge_card_pairs(answer_holder_id)`, 'idx_kc_pairs_answer_holder');

  await run(`
    CREATE TABLE IF NOT EXISTS knowledge_card_votes (
      id SERIAL PRIMARY KEY,
      pair_id INTEGER REFERENCES knowledge_card_pairs(id) ON DELETE CASCADE,
      student_id VARCHAR(50) NOT NULL,
      vote VARCHAR(10) NOT NULL CHECK (vote IN ('up', 'down')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_kc_vote UNIQUE (pair_id, student_id)
    )
  `, 'knowledge_card_votes');
  await run(`CREATE INDEX IF NOT EXISTS idx_kc_votes_pair ON knowledge_card_votes(pair_id)`, 'idx_kc_votes_pair');

  // Migration: add difficulty column to generated_mcqs (1=easy, 2=medium, 3=hard)
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS difficulty SMALLINT DEFAULT 1`, 'generated_mcqs.difficulty');

  // Migration 011 – Rich Question Types
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) DEFAULT 'mcq'`, 'polls.question_type');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS question_image_url TEXT`, 'polls.question_image_url');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS question_latex TEXT`, 'polls.question_latex');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS options_metadata JSONB`, 'polls.options_metadata');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS solution_steps JSONB`, 'polls.solution_steps');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS subject_tag VARCHAR(50)`, 'polls.subject_tag');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT 'medium'`, 'polls.difficulty_level');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS marks INTEGER DEFAULT 1`, 'polls.marks');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS blooms_level VARCHAR(20)`, 'polls.blooms_level');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS topic VARCHAR(100)`, 'polls.topic');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS sub_topic VARCHAR(100)`, 'polls.sub_topic');
  await run(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS cluster_id INTEGER`, 'polls.cluster_id');
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS answer_data JSONB`, 'poll_responses.answer_data');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS subject VARCHAR(50)`, 'sessions.subject');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS subject_tags VARCHAR(50)[]`, 'sessions.subject_tags');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) DEFAULT 'mcq'`, 'generated_mcqs.question_type');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS question_image_url TEXT`, 'generated_mcqs.question_image_url');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS question_latex TEXT`, 'generated_mcqs.question_latex');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS options_metadata JSONB`, 'generated_mcqs.options_metadata');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS solution_steps JSONB`, 'generated_mcqs.solution_steps');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS subject_tag VARCHAR(50)`, 'generated_mcqs.subject_tag');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT 'medium'`, 'generated_mcqs.difficulty_level');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS blooms_level VARCHAR(20)`, 'generated_mcqs.blooms_level');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS topic VARCHAR(100)`, 'generated_mcqs.topic');
  await run(`ALTER TABLE generated_mcqs ADD COLUMN IF NOT EXISTS exam_tags VARCHAR(50)[]`, 'generated_mcqs.exam_tags');
  await run(`CREATE TABLE IF NOT EXISTS poll_clusters (
    id SERIAL PRIMARY KEY, session_id VARCHAR(10), title VARCHAR(255),
    passage TEXT, passage_image_url TEXT, passage_latex TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`, 'poll_clusters');
  await run(`CREATE INDEX IF NOT EXISTS idx_polls_question_type ON polls(question_type)`, 'idx_polls_question_type');
  await run(`CREATE INDEX IF NOT EXISTS idx_polls_subject_tag ON polls(subject_tag)`, 'idx_polls_subject_tag');
  await run(`CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(subject)`, 'idx_sessions_subject');

  // Migration 012 – content_type on resource_chunks
  await run(`ALTER TABLE resource_chunks ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text'`, 'resource_chunks.content_type');
  await run(`CREATE INDEX IF NOT EXISTS idx_resource_chunks_content_type ON resource_chunks(content_type)`, 'idx_resource_chunks_content_type');

  // Migration 013 – Manual grading columns on poll_responses
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS teacher_feedback TEXT`, 'poll_responses.teacher_feedback');
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ`, 'poll_responses.graded_at');
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS graded_by VARCHAR REFERENCES users(id) ON DELETE SET NULL`, 'poll_responses.graded_by');
  await run(`CREATE INDEX IF NOT EXISTS idx_poll_responses_ungraded ON poll_responses(poll_id) WHERE is_correct IS NULL`, 'idx_poll_responses_ungraded');

  // Migration 014 – Student confidence rating
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS confidence VARCHAR(10) CHECK (confidence IN ('low', 'medium', 'high'))`, 'poll_responses.confidence');
  await run(`CREATE INDEX IF NOT EXISTS idx_poll_responses_confidence ON poll_responses(poll_id, confidence) WHERE confidence IS NOT NULL`, 'idx_poll_responses_confidence');

  // Migration 015 – Session lock, proctoring, AI session summary
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`, 'sessions.locked_at');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lock_after_minutes INTEGER`, 'sessions.lock_after_minutes');
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS tab_switches INTEGER DEFAULT 0`, 'poll_responses.tab_switches');
  await run(`ALTER TABLE poll_responses ADD COLUMN IF NOT EXISTS time_focused_ms INTEGER`, 'poll_responses.time_focused_ms');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary_text TEXT`, 'sessions.summary_text');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary_status VARCHAR(20) DEFAULT 'none'`, 'sessions.summary_status');
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ`, 'sessions.summary_generated_at');

  // Migration 016 – competition schema
  await run(`
    CREATE TABLE IF NOT EXISTS competition_rooms (
      id                     SERIAL PRIMARY KEY,
      room_code              VARCHAR(8) UNIQUE NOT NULL,
      session_id             VARCHAR(20) REFERENCES sessions(session_id) ON DELETE CASCADE,
      created_by             VARCHAR REFERENCES users(id),
      status                 VARCHAR(20) DEFAULT 'waiting',
      current_question_index INTEGER DEFAULT -1,
      question_start_time    BIGINT,
      time_per_question      INTEGER DEFAULT 20,
      teacher_question_count INTEGER DEFAULT 0,
      total_questions        INTEGER DEFAULT 0,
      started_at             TIMESTAMP,
      ended_at               TIMESTAMP,
      created_at             TIMESTAMP DEFAULT NOW()
    )
  `, 'competition_rooms');
  await run(`
    CREATE TABLE IF NOT EXISTS competition_participants (
      id                 SERIAL PRIMARY KEY,
      room_id            INTEGER REFERENCES competition_rooms(id) ON DELETE CASCADE,
      student_id         VARCHAR REFERENCES users(id),
      role               VARCHAR(10) DEFAULT 'player',
      score              INTEGER DEFAULT 0,
      correct_count      INTEGER DEFAULT 0,
      questions_answered INTEGER DEFAULT 0,
      joined_at          TIMESTAMP DEFAULT NOW(),
      UNIQUE(room_id, student_id)
    )
  `, 'competition_participants');
  await run(`
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
    )
  `, 'competition_answers');
  await run(`
    CREATE TABLE IF NOT EXISTS student_questions (
      id             SERIAL PRIMARY KEY,
      session_id     VARCHAR(20) REFERENCES sessions(session_id) ON DELETE CASCADE,
      created_by     VARCHAR REFERENCES users(id),
      question       TEXT NOT NULL,
      options        JSONB NOT NULL,
      correct_answer INTEGER NOT NULL,
      justification  TEXT,
      source         VARCHAR(10) DEFAULT 'ai',
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `, 'student_questions');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_rooms_status ON competition_rooms(status)`, 'idx_competition_rooms_status');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_rooms_session ON competition_rooms(session_id)`, 'idx_competition_rooms_session');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_participants_room ON competition_participants(room_id)`, 'idx_competition_participants_room');
  await run(`CREATE INDEX IF NOT EXISTS idx_competition_answers_room ON competition_answers(room_id)`, 'idx_competition_answers_room');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_questions_session ON student_questions(session_id)`, 'idx_student_questions_session');
  await run(`CREATE INDEX IF NOT EXISTS idx_student_questions_creator ON student_questions(created_by)`, 'idx_student_questions_creator');
  // Columns added in uncommitted competition improvements
  await run(`ALTER TABLE competition_rooms ADD COLUMN IF NOT EXISTS student_question_ids INTEGER[]`, 'competition_rooms.student_question_ids');
  await run(`ALTER TABLE competition_rooms ADD COLUMN IF NOT EXISTS teacher_poll_ids INTEGER[]`, 'competition_rooms.teacher_poll_ids');

  // Migration 017 – AI Project Lab: project suggestions, assignments, submissions, notifications
  await run(`
    CREATE TABLE IF NOT EXISTS session_projects (
      id                  SERIAL PRIMARY KEY,
      session_id          INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      generated_by        VARCHAR REFERENCES users(id),
      generation_status   VARCHAR(20) NOT NULL DEFAULT 'none'
                          CHECK (generation_status IN ('none','generating','completed','failed')),
      suggestions         JSONB NOT NULL DEFAULT '[]',
      is_published        BOOLEAN NOT NULL DEFAULT FALSE,
      generation_error    TEXT,
      generated_at        TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'session_projects');
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_session_projects_session ON session_projects(session_id)`, 'idx_session_projects_session');

  await run(`
    CREATE TABLE IF NOT EXISTS project_assignments (
      id          SERIAL PRIMARY KEY,
      session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      project_id  INTEGER REFERENCES session_projects(id) ON DELETE SET NULL,
      created_by  VARCHAR NOT NULL REFERENCES users(id),
      title       VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      difficulty  VARCHAR(20) CHECK (difficulty IN ('beginner','intermediate','advanced')),
      due_date    TIMESTAMP,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'project_assignments');
  await run(`CREATE INDEX IF NOT EXISTS idx_project_assignments_session ON project_assignments(session_id)`, 'idx_project_assignments_session');

  await run(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id              SERIAL PRIMARY KEY,
      assignment_id   INTEGER NOT NULL REFERENCES project_assignments(id) ON DELETE CASCADE,
      student_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      submission_type VARCHAR(10) NOT NULL CHECK (submission_type IN ('text','file')),
      content         TEXT,
      file_url        TEXT,
      file_name       VARCHAR(255),
      file_type       VARCHAR(50),
      status          VARCHAR(20) NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted','reviewed')),
      submitted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(assignment_id, student_id)
    )
  `, 'assignment_submissions');
  await run(`CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id)`, 'idx_submissions_assignment');
  await run(`CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id)`, 'idx_submissions_student');

  await run(`
    CREATE TABLE IF NOT EXISTS session_notifications (
      id           SERIAL PRIMARY KEY,
      session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sender_id    VARCHAR NOT NULL REFERENCES users(id),
      type         VARCHAR(30) NOT NULL
                   CHECK (type IN ('project_suggestion','assignment')),
      reference_id INTEGER,
      title        VARCHAR(255) NOT NULL,
      body         TEXT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, 'session_notifications');
  await run(`CREATE INDEX IF NOT EXISTS idx_session_notifs_session ON session_notifications(session_id, created_at DESC)`, 'idx_session_notifs_session');

  // Initialize cache service
  const cacheService = require('../services/cacheService');
  await cacheService.init().catch(err => logger.warn('Cache service init failed (non-fatal)', { error: err.message }));

  client.release();
  logger.info('Auto-migration complete');
}

module.exports = { runAutoMigrations };

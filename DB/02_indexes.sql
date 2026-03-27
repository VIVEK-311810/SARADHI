-- ============================================================
-- 02_indexes.sql
-- All performance indexes (excludes PK indexes — auto-created by PRIMARY KEY)
-- Sourced from live Supabase database — Project_IIT
-- ============================================================

-- ─── users ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth_id        ON users(oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_register_number ON users(register_number);
CREATE INDEX IF NOT EXISTS idx_users_role            ON users(role);

-- ─── sessions ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_is_active  ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_id ON sessions(teacher_id);

-- ─── session_participants ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_participants_active       ON session_participants(is_active);
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id   ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_student_id   ON session_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_sp_session_attendance
  ON session_participants(session_id, attendance_status);
-- Partial index: only active participants (used in participant count queries)
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id_active
  ON session_participants(session_id, is_active)
  WHERE is_active = true;

-- ─── polls ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_polls_session_id    ON polls(session_id);
CREATE INDEX IF NOT EXISTS idx_polls_is_active     ON polls(is_active);
CREATE INDEX IF NOT EXISTS idx_polls_queue_status  ON polls(queue_status);
CREATE INDEX IF NOT EXISTS idx_polls_queue_position ON polls(queue_position);
CREATE INDEX IF NOT EXISTS idx_polls_created_at    ON polls(created_at);
-- Partial index: only active polls that haven't expired (used in timer queries)
CREATE INDEX IF NOT EXISTS idx_polls_active_ends
  ON polls(is_active, ends_at)
  WHERE is_active = true;
-- Composite: active poll lookup per session
CREATE INDEX IF NOT EXISTS idx_polls_session_id_active
  ON polls(session_id, is_active)
  WHERE is_active = true;

-- ─── poll_responses ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_poll_responses_poll_id      ON poll_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_student_id   ON poll_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_responded_at ON poll_responses(responded_at);

-- ─── generated_mcqs ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_generated_mcqs_session_id      ON generated_mcqs(session_id);
CREATE INDEX IF NOT EXISTS idx_generated_mcqs_sent_to_students ON generated_mcqs(sent_to_students);
CREATE INDEX IF NOT EXISTS idx_generated_mcqs_created_at       ON generated_mcqs(created_at);

-- ─── resources ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resources_session_id         ON resources(session_id);
CREATE INDEX IF NOT EXISTS idx_resources_teacher_id         ON resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_resources_type               ON resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resources_vectorized         ON resources(is_vectorized);
CREATE INDEX IF NOT EXISTS idx_resources_session_vectorized ON resources(session_id, is_vectorized);
-- GIN index for array keyword search
CREATE INDEX IF NOT EXISTS idx_resources_keywords
  ON resources USING GIN(extractive_keywords);

-- ─── resource_chunks ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chunks_resource_id   ON resource_chunks(resource_id);
CREATE INDEX IF NOT EXISTS idx_chunks_vector_id     ON resource_chunks(pinecone_vector_id);

-- ─── resource_access_logs ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_access_logs_resource_id ON resource_access_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_student_id  ON resource_access_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_action      ON resource_access_logs(action);

-- ─── uploaded_resources ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_session_id ON uploaded_resources(session_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_teacher_id ON uploaded_resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_type       ON uploaded_resources(resource_type);

-- ─── query_classifications ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_query_classifications_session_id ON query_classifications(session_id);
CREATE INDEX IF NOT EXISTS idx_query_classifications_hash       ON query_classifications(query_hash);

-- ─── transcription_sessions ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transcription_sessions_session_id ON transcription_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_transcription_sessions_status     ON transcription_sessions(status);

-- ─── transcripts ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transcripts_session_db_id         ON transcripts(session_db_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_sent_to_webhook       ON transcripts(sent_to_webhook);
-- Composite: most common query pattern — unsent segments per session
CREATE INDEX IF NOT EXISTS idx_transcripts_session_sent
  ON transcripts(session_db_id, sent_to_webhook);

-- ─── student_points ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_points_student_id ON student_points(student_id);
CREATE INDEX IF NOT EXISTS idx_student_points_session_id ON student_points(session_id);
-- Composite: leaderboard queries
CREATE INDEX IF NOT EXISTS idx_student_points_student_session
  ON student_points(student_id, session_id);
-- Partial unique: prevent duplicate session-level awards (where poll_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS unique_session_level_points
  ON student_points(student_id, session_id, point_type)
  WHERE poll_id IS NULL;

-- ─── student_badges ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_badges_student_id ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_student_badges_session_id ON student_badges(session_id);

-- ─── student_streaks ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_streaks_student_id ON student_streaks(student_id);

-- ─── student_xp ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_xp_student_id ON student_xp(student_id);
CREATE INDEX IF NOT EXISTS idx_student_xp_session_id  ON student_xp(session_id);

-- ─── session_streaks ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_streaks_student_session ON session_streaks(student_id, session_id);

-- ─── session_summaries ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_summaries_student_id ON session_summaries(student_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_session_id ON session_summaries(session_id);

-- ─── session_attendance_windows ──────────────────────────────
-- Partial unique: only one active attendance window per session at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_window_per_session
  ON session_attendance_windows(session_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_attendance_window_session
  ON session_attendance_windows(session_id, is_active);
-- Missing in original: index for opened_by FK (flagged by Supabase advisor)
CREATE INDEX IF NOT EXISTS idx_attendance_window_opened_by
  ON session_attendance_windows(opened_by);

-- ─── community_tickets ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_session_id ON community_tickets(session_id);
CREATE INDEX IF NOT EXISTS idx_tickets_author_id  ON community_tickets(author_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON community_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_upvotes    ON community_tickets(upvote_count DESC);
-- Partial index: global tickets only (session_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_tickets_subject
  ON community_tickets(subject)
  WHERE session_id IS NULL;

-- ─── community_replies ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_replies_ticket_id ON community_replies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_replies_author_id ON community_replies(author_id);

-- ─── community_upvotes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_upvotes_ticket_id ON community_upvotes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_upvotes_user_id   ON community_upvotes(user_id);

-- ─── ai_conversations ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_conversations_student_session
  ON ai_conversations(student_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_session
  ON ai_conversations(session_id, created_at DESC);

-- ─── ai_messages ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON ai_messages(conversation_id, created_at);

-- ─── ai_doubts ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_doubts_session_status
  ON ai_doubts(session_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_doubts_student_id
  ON ai_doubts(student_id, created_at DESC);
-- Missing in original: indexes for FKs (flagged by Supabase advisor)
CREATE INDEX IF NOT EXISTS idx_ai_doubts_message_id  ON ai_doubts(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_doubts_resolved_by ON ai_doubts(resolved_by);

-- ─── ai_study_analytics ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_study_analytics_student_id ON ai_study_analytics(student_id);

-- ─── session_notes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id);

-- ─── knowledge_card_rounds ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kc_rounds_session_id ON knowledge_card_rounds(session_id);

-- ─── knowledge_card_pairs ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kc_pairs_round_id       ON knowledge_card_pairs(round_id);
CREATE INDEX IF NOT EXISTS idx_kc_pairs_question_holder ON knowledge_card_pairs(question_holder_id);
CREATE INDEX IF NOT EXISTS idx_kc_pairs_answer_holder   ON knowledge_card_pairs(answer_holder_id);

-- ─── knowledge_card_votes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kc_votes_pair_id ON knowledge_card_votes(pair_id);

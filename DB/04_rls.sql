-- ============================================================
-- 04_rls.sql
-- Row Level Security — enable on all tables to block direct
-- PostgREST/Supabase API access.
--
-- The app uses Express.js + service role key, which BYPASSES
-- RLS automatically. So enabling RLS with NO policies means:
--   ✅ Express.js backend: full access (service role)
--   ❌ Direct REST API calls from browser: blocked
--
-- Run this to fix the Supabase security advisories.
-- DO NOT run on a plain PostgreSQL install unless you also
-- use a connection pooler that sets the role correctly.
-- ============================================================

ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_responses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_mcqs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_chunks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_access_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_resources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_classifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_points             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_badges             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_streaks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_xp                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_streaks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendance_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_replies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_upvotes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_doubts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_study_analytics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_card_rounds      ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_card_pairs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_card_votes       ENABLE ROW LEVEL SECURITY;

-- NOTE: On a plain PostgreSQL install (DGX), the app connects as
-- a superuser or the DB owner, which bypasses RLS anyway.
-- This file is mainly useful for the Supabase environment.
-- On DGX, skip this file and rely on network/firewall isolation instead.

-- Migration 008: AI Study Assistant — conversations, doubts, study analytics
-- This migration adds server-side conversation history, doubt tracking, and study analytics

-- Conversation threads (replaces localStorage-based chat history)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(10) NOT NULL,
  student_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_student_session
  ON ai_conversations(student_id, session_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_session
  ON ai_conversations(session_id, created_at DESC);

-- Individual messages within a conversation
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_type VARCHAR(30) DEFAULT 'text',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON ai_messages(conversation_id, created_at);

-- Doubt tracking — students mark messages as "still confused"
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
);

CREATE INDEX IF NOT EXISTS idx_ai_doubts_session_status
  ON ai_doubts(session_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_doubts_student
  ON ai_doubts(student_id, created_at DESC);

-- Study analytics per student per session
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
);

CREATE INDEX IF NOT EXISTS idx_ai_study_analytics_student
  ON ai_study_analytics(student_id);

-- Add section_title column to resource_chunks if it doesn't exist
ALTER TABLE resource_chunks ADD COLUMN IF NOT EXISTS section_title VARCHAR(255);

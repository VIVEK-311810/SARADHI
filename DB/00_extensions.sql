-- ============================================================
-- 00_extensions.sql
-- PostgreSQL extensions required by SAS Edu AI
-- Run this FIRST before any other file
-- ============================================================

-- UUID generation (used by resources, resource_chunks, etc.)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto — gen_random_uuid() used by ai_conversations, ai_messages, ai_doubts, ai_study_analytics
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

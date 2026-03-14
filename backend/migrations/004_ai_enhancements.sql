-- Migration 004: AI Assistant Enhancements
-- Adds support for query classification, file summarization, and RAG

-- Add columns to resources table for summarization and keyword extraction
ALTER TABLE resources
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS extractive_keywords TEXT[],
ADD COLUMN IF NOT EXISTS topic_tags TEXT[];

-- Create query classification cache table
CREATE TABLE IF NOT EXISTS query_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(10) NOT NULL,
  query_text TEXT NOT NULL,
  query_hash VARCHAR(64) NOT NULL,
  query_type VARCHAR(50) NOT NULL,
  extracted_entities JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(query_hash, session_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_query_classifications_session
ON query_classifications(session_id);

CREATE INDEX IF NOT EXISTS idx_query_classifications_hash
ON query_classifications(query_hash);

CREATE INDEX IF NOT EXISTS idx_resources_keywords
ON resources USING GIN(extractive_keywords);

CREATE INDEX IF NOT EXISTS idx_resources_session_vectorized
ON resources(session_id, is_vectorized);

-- Add comment for documentation
COMMENT ON TABLE query_classifications IS 'Caches query classifications to avoid re-processing identical queries';
COMMENT ON COLUMN resources.summary IS 'AI-generated summary of the resource content';
COMMENT ON COLUMN resources.extractive_keywords IS 'Extracted keywords for fast topic filtering';
COMMENT ON COLUMN resources.topic_tags IS 'Topic tags for categorization';

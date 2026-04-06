-- Migration 012: Add content_type to resource_chunks
-- Enables the RAG pipeline to tag each chunk as equation/code/table/text
-- and format it appropriately when building Mistral context.

ALTER TABLE resource_chunks
  ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text';

CREATE INDEX IF NOT EXISTS idx_resource_chunks_content_type ON resource_chunks(content_type);

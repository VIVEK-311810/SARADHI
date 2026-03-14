-- Audio Transcription System Schema
-- Replicate desktop app functionality with GPU server integration

-- Session tracking table
CREATE TABLE IF NOT EXISTS transcription_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL, -- Allows duplicate session_ids for multiple recordings
  segment_interval INTEGER NOT NULL, -- interval in minutes for webhook sends
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  is_paused BOOLEAN DEFAULT false,
  pdf_uploaded BOOLEAN DEFAULT false,
  pdf_filename VARCHAR(500),
  status VARCHAR(50) DEFAULT 'active', -- active, paused, stopped
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual transcript segments table
CREATE TABLE IF NOT EXISTS transcripts (
  id SERIAL PRIMARY KEY,
  session_db_id INTEGER NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
  segment_text TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_to_webhook BOOLEAN DEFAULT false,
  detected_language VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_db_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_sent ON transcripts(sent_to_webhook);
CREATE INDEX IF NOT EXISTS idx_transcripts_session_sent ON transcripts(session_db_id, sent_to_webhook);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON transcription_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON transcription_sessions(session_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_transcription_sessions_updated_at ON transcription_sessions;

CREATE TRIGGER update_transcription_sessions_updated_at
  BEFORE UPDATE ON transcription_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE transcription_sessions IS 'Tracks audio recording sessions with timer intervals for webhook posting';
COMMENT ON TABLE transcripts IS 'Stores individual transcript segments from GPU transcription server';
COMMENT ON COLUMN transcription_sessions.segment_interval IS 'Minutes between automatic webhook posts of accumulated transcripts';
COMMENT ON COLUMN transcripts.sent_to_webhook IS 'True if this segment was included in a webhook post';

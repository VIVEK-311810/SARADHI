-- Drop existing tables and recreate with composite primary key schema
-- WARNING: This will delete all existing data!

DROP TABLE IF EXISTS transcripts CASCADE;
DROP TABLE IF EXISTS transcription_sessions CASCADE;
DROP TRIGGER IF EXISTS update_transcription_sessions_updated_at ON transcription_sessions;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Now run the main migration

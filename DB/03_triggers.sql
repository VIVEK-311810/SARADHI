-- ============================================================
-- 03_triggers.sql
-- Functions and triggers for automatic timestamp management
-- ============================================================

-- ─── Generic updated_at function ─────────────────────────────
-- Used by transcription_sessions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── transcription_sessions ──────────────────────────────────
DROP TRIGGER IF EXISTS update_transcription_sessions_updated_at ON transcription_sessions;
CREATE TRIGGER update_transcription_sessions_updated_at
  BEFORE UPDATE ON transcription_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ─── uploaded_resources ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_uploaded_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_uploaded_resources_updated_at ON uploaded_resources;
CREATE TRIGGER trigger_update_uploaded_resources_updated_at
  BEFORE UPDATE ON uploaded_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_uploaded_resources_updated_at();

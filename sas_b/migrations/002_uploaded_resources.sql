-- Migration for Uploaded Resources System
-- This creates tables for file/URL resource management

-- Create uploaded_resources table
CREATE TABLE IF NOT EXISTS uploaded_resources (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(10) NOT NULL,
  teacher_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  resource_type VARCHAR(50) NOT NULL, -- 'pdf', 'ppt', 'doc', 'url', 'image', 'excel', 'zip', 'other'
  file_url TEXT NOT NULL, -- Cloudinary URL or external link
  file_name VARCHAR(255),
  file_size INTEGER, -- in bytes, null for URLs
  mime_type VARCHAR(100),
  is_downloadable BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session
    FOREIGN KEY(session_id)
    REFERENCES sessions(session_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_teacher
    FOREIGN KEY(teacher_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

-- Create resource_access_logs table for analytics
CREATE TABLE IF NOT EXISTS resource_access_logs (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'view', 'download'
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resource
    FOREIGN KEY(resource_id)
    REFERENCES uploaded_resources(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_student
    FOREIGN KEY(student_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_session ON uploaded_resources(session_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_teacher ON uploaded_resources(teacher_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_resources_type ON uploaded_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_access_logs_resource ON resource_access_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_access_logs_student ON resource_access_logs(student_id);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_uploaded_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_uploaded_resources_updated_at
  BEFORE UPDATE ON uploaded_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_uploaded_resources_updated_at();

-- Add comments for documentation
COMMENT ON TABLE uploaded_resources IS 'Stores metadata for files and URLs uploaded by teachers for sessions';
COMMENT ON TABLE resource_access_logs IS 'Tracks student interactions with resources for analytics';
COMMENT ON COLUMN uploaded_resources.resource_type IS 'Type of resource: pdf, ppt, doc, url, image, excel, zip, other';
COMMENT ON COLUMN uploaded_resources.file_url IS 'Cloudinary URL for uploaded files or external URL for links';
COMMENT ON COLUMN resource_access_logs.action IS 'Type of action: view or download';

CREATE TABLE IF NOT EXISTS pdf_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'created', 'uploading', 'uploaded', 'queued', 'processing',
    'uploading_result', 'completed', 'failed', 'cancelled'
  )),
  input_key TEXT,
  input_type TEXT CHECK (input_type IS NULL OR input_type IN ('md', 'zip')),
  input_content_type TEXT,
  input_size INTEGER,
  result_key TEXT,
  result_size INTEGER,
  workflow_run_id TEXT,
  workflow_url TEXT,
  commit_sha TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_user_created
  ON pdf_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status_updated
  ON pdf_jobs (status, updated_at DESC);

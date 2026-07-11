export type PdfJobStatus =
  | 'created'
  | 'uploading'
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'uploading_result'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PdfInputType = 'md' | 'zip';

export interface Env {
  DB: D1Database;
  PDF_BUCKET: R2Bucket;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW_FILE: string;
  GITHUB_WORKFLOW_REF: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  PDF_CALLBACK_SECRET: string;
  PDF_API_TOKEN: string;
  FRONTEND_ORIGIN: string;
  MAX_UPLOAD_BYTES?: string;
  PRESIGNED_URL_TTL_SECONDS?: string;
}

export interface PdfJobRow {
  id: string;
  user_id: string;
  status: PdfJobStatus;
  input_key: string | null;
  input_type: PdfInputType | null;
  input_content_type: string | null;
  input_size: number | null;
  result_key: string | null;
  result_size: number | null;
  workflow_run_id: string | null;
  workflow_url: string | null;
  commit_sha: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface PdfJobResponse {
  jobId: string;
  status: PdfJobStatus;
  inputType: PdfInputType | null;
  inputSize: number | null;
  resultSize: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  workflowRunId: string | null;
  workflowUrl: string | null;
  resultKey: string | null;
  errorMessage: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'API_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

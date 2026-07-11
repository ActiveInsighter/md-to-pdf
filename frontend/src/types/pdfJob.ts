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

export interface PdfJob {
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

export interface UploadTarget {
  uploadUrl: string;
  inputKey: string;
  inputType: PdfInputType;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
}

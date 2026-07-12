export const PDF_JOB_STATUSES = [
  'created',
  'uploaded',
  'queued',
  'building',
  'uploading',
  'completed',
  'failed',
  'expired',
] as const

export type PdfJobStatus = (typeof PDF_JOB_STATUSES)[number]

export type PdfJob = {
  id: string
  user_id: string
  status: PdfJobStatus
  input_path: string | null
  assets_path: string | null
  output_path: string | null
  source_filename: string
  document_name: string
  has_assets: boolean
  theme: string
  options: { breaks?: boolean; toc?: boolean }
  github_run_id: number | null
  github_run_url: string | null
  error_message: string | null
  progress_percent?: number | null
  progress_stage?: string | null
  created_at: string
  updated_at: string
  uploaded_at?: string | null
  queued_at?: string | null
  started_at: string | null
  rendering_at?: string | null
  uploading_at?: string | null
  completed_at: string | null
  expires_at: string
}

export type CreatePdfJobResponse = {
  jobId: string
  status: PdfJobStatus
  inputPath: string
  assetsPath: string | null
  sourceFilename: string
  documentName: string
  outputFilename: string
  theme: string
  options: { breaks: true; toc: true }
  expiresAt: string
}

export type PdfDownload = {
  downloadUrl: string
  fileName: string
}

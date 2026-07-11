export type PdfJobStatus =
  'created' | 'uploaded' | 'queued' | 'building' | 'uploading' | 'completed' | 'failed' | 'expired'

export const PDF_JOB_STATUS_LABELS: Record<PdfJobStatus, string> = {
  created: '准备上传',
  uploaded: '上传完成',
  queued: '等待构建',
  building: '正在构建',
  uploading: '正在上传 PDF',
  completed: '已完成',
  failed: '构建失败',
  expired: '已过期',
}

export type PdfJob = {
  id: string
  user_id: string
  status: PdfJobStatus
  input_path: string | null
  assets_path: string | null
  output_path: string | null
  has_assets: boolean
  theme: string
  options: { breaks?: boolean; toc?: boolean }
  github_run_id: number | null
  github_run_url: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  expires_at: string
}

export type CreatePdfJobResponse = {
  jobId: string
  status: PdfJobStatus
  inputPath: string
  assetsPath: string | null
  theme: string
  options: { breaks: true; toc: true }
  expiresAt: string
}

import type { PdfJob, PdfJobStatus } from '../types/pdfJob'

const FALLBACK_PROGRESS: Record<PdfJobStatus, number> = {
  created: 5,
  uploaded: 25,
  queued: 35,
  building: 60,
  uploading: 92,
  completed: 100,
  failed: 0,
  expired: 0,
}

const FALLBACK_MESSAGES: Record<PdfJobStatus, string> = {
  created: '等待上传文件',
  uploaded: '文件上传完成',
  queued: '已进入构建队列',
  building: '正在生成 PDF',
  uploading: '正在上传生成结果',
  completed: 'PDF 已生成，可以下载',
  failed: 'PDF 构建失败',
  expired: '任务已过期',
}

export type PdfJobProgress = {
  percent: number
  message: string
}

export function getPdfJobProgress(
  job: Pick<PdfJob, 'status' | 'progress_percent' | 'progress_message' | 'error_message'>,
): PdfJobProgress {
  const stored = Number(job.progress_percent)
  const fallback = FALLBACK_PROGRESS[job.status]
  const percent = Number.isFinite(stored)
    ? Math.min(100, Math.max(0, Math.round(stored)))
    : fallback

  const storedMessage = String(job.progress_message || '').trim()
  const message = job.status === 'failed'
    ? String(job.error_message || storedMessage || FALLBACK_MESSAGES.failed).trim()
    : storedMessage || FALLBACK_MESSAGES[job.status]

  return { percent, message }
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) return `${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes} 分 ${remainingSeconds} 秒` : `${minutes} 分钟`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分` : `${hours} 小时`
}

export function getPdfJobElapsedMs(
  job: Pick<PdfJob, 'created_at' | 'completed_at' | 'failed_at'>,
  now = Date.now(),
): number {
  const start = Date.parse(job.created_at)
  const terminal = Date.parse(job.completed_at || job.failed_at || '')
  const end = Number.isFinite(terminal) ? terminal : now
  return Number.isFinite(start) ? Math.max(0, end - start) : 0
}

export function getPdfJobBuildElapsedMs(
  job: Pick<PdfJob, 'queued_at' | 'started_at' | 'completed_at' | 'failed_at'>,
  now = Date.now(),
): number | null {
  const start = Date.parse(job.started_at || job.queued_at || '')
  if (!Number.isFinite(start)) return null

  const terminal = Date.parse(job.completed_at || job.failed_at || '')
  const end = Number.isFinite(terminal) ? terminal : now
  return Math.max(0, end - start)
}

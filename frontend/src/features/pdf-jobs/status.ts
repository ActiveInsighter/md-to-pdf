import type { BadgeProps } from '@/components/ui/badge'
import { PDF_JOB_TERMINAL_STATUSES, type JobDisplayStatus, type PdfJob, type PdfJobStatus } from './types'

const DEFAULT_PROGRESS: Record<JobDisplayStatus, number> = {
  created: 5,
  uploaded: 25,
  queued: 30,
  running: 65,
  uploading: 90,
  completed: 100,
  failed: 0,
  cancelled: 0,
  expired: 100,
}

const LABELS: Record<JobDisplayStatus, string> = {
  created: '待上传',
  uploaded: '已上传',
  queued: '排队中',
  running: '构建中',
  uploading: '上传 PDF 中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  expired: '已过期',
}

const STAGES: Record<JobDisplayStatus, string> = {
  created: '任务已创建，等待上传源文件',
  uploaded: '源文件已上传，等待生成 PDF',
  queued: '已进入 GitHub Actions 队列',
  running: '正在渲染文档与生成 PDF',
  uploading: 'PDF 已生成，正在安全交付',
  completed: 'PDF 已生成，可以下载',
  failed: '构建未完成，请查看错误原因',
  cancelled: '任务在启动前已取消',
  expired: '产物已过期，需要重新构建',
}

const MACHINE_STAGE_TOKENS = new Set([
  'created',
  'uploaded',
  'queued',
  'building',
  'running',
  'rendering',
  'uploading',
  'uploading_output',
  'completed',
  'failed',
  'cancelled',
  'expired',
])

export function getJobDisplayStatus(job: Pick<PdfJob, 'status'>): JobDisplayStatus {
  if (job.status === 'building') return 'running'
  return job.status
}

export function isTerminalJob(job: Pick<PdfJob, 'status'>): boolean {
  return (PDF_JOB_TERMINAL_STATUSES as readonly PdfJobStatus[]).includes(job.status)
}

export function getJobStatusLabel(job: Pick<PdfJob, 'status'>): string {
  return LABELS[getJobDisplayStatus(job)]
}

export function getJobStatusVariant(job: Pick<PdfJob, 'status'>): BadgeProps['variant'] {
  const status = getJobDisplayStatus(job)
  if (status === 'completed') return 'success'
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'destructive'
  if (status === 'uploaded' || status === 'queued') return 'warning'
  return 'default'
}

export function getJobProgress(job: Pick<PdfJob, 'status' | 'error_message' | 'progress_percent'>): number {
  if (typeof job.progress_percent === 'number' && Number.isFinite(job.progress_percent)) {
    return Math.max(0, Math.min(100, Math.round(job.progress_percent)))
  }
  return DEFAULT_PROGRESS[getJobDisplayStatus(job)]
}

export function getJobStageDescription(job: Pick<PdfJob, 'status' | 'error_message' | 'progress_stage'>): string {
  const stage = job.progress_stage?.trim()
  if (stage && !MACHINE_STAGE_TOKENS.has(stage.toLowerCase())) return stage
  return STAGES[getJobDisplayStatus(job)]
}

export function canCancelJob(job: Pick<PdfJob, 'status'>): boolean {
  return job.status === 'created' || job.status === 'uploaded'
}

export function canRetryJob(job: Pick<PdfJob, 'status'>): boolean {
  return job.status === 'failed' || job.status === 'expired'
}

export function canDownloadJob(job: Pick<PdfJob, 'status' | 'expires_at'>): boolean {
  return job.status === 'completed' && new Date(job.expires_at).getTime() > Date.now()
}

import { isTerminalJob } from './status'
import type { PdfJob } from './types'

export type JobTimelineStep = {
  key: string
  label: string
  at: string | null | undefined
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return '—'

  const totalSeconds = Math.floor(milliseconds / 1000)
  if (totalSeconds < 1) return '<1 秒'

  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${String(minutes).padStart(2, '0')} 分`
  if (minutes > 0) return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`
  return `${seconds} 秒`
}

export function getJobTimingStart(job: PdfJob): string | null {
  return job.started_at
    || job.queued_at
    || job.uploaded_at
    || job.created_at
    || null
}

export function getJobElapsedMilliseconds(job: PdfJob, now = Date.now()): number | null {
  const start = toTimestamp(getJobTimingStart(job))
  if (start === null) return null

  const terminalTime = job.completed_at || (isTerminalJob(job) ? job.updated_at : null)
  const end = toTimestamp(terminalTime) ?? now
  return Math.max(0, end - start)
}

export function getJobTimingSummary(job: PdfJob, now = Date.now()): { label: string; value: string } {
  return {
    label: isTerminalJob(job) ? '总耗时' : '已用时',
    value: formatDuration(getJobElapsedMilliseconds(job, now)),
  }
}

export function getJobTimeline(job: PdfJob): JobTimelineStep[] {
  const steps: JobTimelineStep[] = [
    { key: 'created', label: '创建任务', at: job.created_at },
    { key: 'uploaded', label: '文件上传完成', at: job.uploaded_at },
    { key: 'queued', label: '进入构建队列', at: job.queued_at },
    { key: 'started', label: '开始构建', at: job.started_at },
    { key: 'rendering', label: '开始渲染', at: job.rendering_at },
    { key: 'uploading', label: '上传 PDF', at: job.uploading_at },
  ]

  if (job.status === 'failed' || job.status === 'cancelled') {
    return [
      ...steps,
      {
        key: job.status,
        label: job.status === 'cancelled' ? '任务已取消' : '任务失败',
        at: job.updated_at,
      },
    ]
  }

  steps.push({ key: 'completed', label: '任务完成', at: job.completed_at })
  if (job.status === 'expired') {
    steps.push({ key: 'expired', label: '产物已过期', at: job.updated_at })
  }
  return steps
}

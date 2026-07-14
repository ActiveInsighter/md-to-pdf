import { isTerminalJob } from './status'
import type { PdfJob } from './types'

export type JobFlowStepState = 'complete' | 'active' | 'pending' | 'error'

export type JobFlowStep = {
  key: string
  label: string
  at: string | null | undefined
  elapsedMilliseconds: number | null
  state: JobFlowStepState
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

export function formatElapsedClock(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return '--:--'
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function getJobTimingStart(job: PdfJob): string | null {
  return job.created_at
    || job.uploaded_at
    || job.queued_at
    || job.started_at
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

function currentBaseStepIndex(job: PdfJob, baseSteps: Array<{ at: string | null | undefined }>): number {
  if (job.status === 'created') return 0
  if (job.status === 'uploaded') return 1
  if (job.status === 'queued') return 2
  if (job.status === 'building') return job.rendering_at ? 4 : 3
  if (job.status === 'uploading') return 5
  if (job.status === 'completed' || job.status === 'expired') return baseSteps.length

  let reached = 0
  baseSteps.forEach((step, index) => {
    if (toTimestamp(step.at) !== null) reached = index
  })
  return reached
}

export function getJobFlowSteps(job: PdfJob, now = Date.now()): JobFlowStep[] {
  const baseSteps = [
    { key: 'created', label: '创建任务', at: job.created_at },
    { key: 'uploaded', label: '上传完成', at: job.uploaded_at },
    { key: 'queued', label: '进入队列', at: job.queued_at },
    { key: 'started', label: '开始构建', at: job.started_at },
    { key: 'rendering', label: '渲染文档', at: job.rendering_at },
    { key: 'uploading', label: '上传 PDF', at: job.uploading_at },
  ]

  const finalStep = job.status === 'failed' || job.status === 'cancelled'
    ? {
        key: job.status,
        label: job.status === 'cancelled' ? '任务取消' : '构建失败',
        at: job.updated_at,
      }
    : job.status === 'expired'
      ? { key: 'expired', label: '产物过期', at: job.updated_at }
      : { key: 'completed', label: '交付完成', at: job.completed_at }

  const rawSteps = [...baseSteps, finalStep]
  const start = toTimestamp(getJobTimingStart(job))
  const currentIndex = currentBaseStepIndex(job, baseSteps)
  const terminal = isTerminalJob(job)

  return rawSteps.map((step, index) => {
    const timestamp = toTimestamp(step.at)
    const isFinal = index === rawSteps.length - 1
    let state: JobFlowStepState

    if (isFinal && terminal) {
      state = job.status === 'completed' ? 'complete' : 'error'
    } else if (terminal) {
      state = index <= currentIndex ? 'complete' : 'pending'
    } else if (index < currentIndex) {
      state = 'complete'
    } else if (index === currentIndex) {
      state = 'active'
    } else {
      state = 'pending'
    }

    const elapsedMilliseconds = timestamp !== null && start !== null
      ? Math.max(0, timestamp - start)
      : state === 'active' && start !== null
        ? Math.max(0, now - start)
        : null

    return { ...step, elapsedMilliseconds, state }
  })
}

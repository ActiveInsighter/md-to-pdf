import { useEffect, useState } from 'react'
import type { PdfJob } from '../types/pdfJob'
import {
  getPdfJobProgress,
  getPdfJobStageLabel,
  isTerminalPdfJobStatus,
  PDF_JOB_STATUS_LABELS,
} from '../utils/pdfJobStatus'

type Props = {
  job: PdfJob | null
  autoDownload: boolean
  notifyOnComplete: boolean
  onDownload: () => void
  onNew: () => void
}

function dateValue(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function formatTime(value: string | null | undefined): string {
  const timestamp = dateValue(value)
  return timestamp === null ? '—' : new Date(timestamp).toLocaleString()
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) return '—'
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes} 分 ${remainingSeconds} 秒`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

export function PdfJobStatus({ job, autoDownload, notifyOnComplete, onDownload, onNew }: Props) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!job || isTerminalPdfJobStatus(job.status)) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  if (!job) return null

  const terminal = isTerminalPdfJobStatus(job.status)
  const progress = getPdfJobProgress(job)
  const createdAt = dateValue(job.created_at)
  const queuedAt = dateValue(job.queued_at)
  const startedAt = dateValue(job.started_at)
  const completedAt = dateValue(job.completed_at)
  const endAt = completedAt ?? (terminal ? dateValue(job.updated_at) : now)
  const totalDuration = createdAt !== null && endAt !== null ? endAt - createdAt : null
  const queueDuration = queuedAt !== null && startedAt !== null
    ? startedAt - queuedAt
    : queuedAt !== null && !terminal
      ? now - queuedAt
      : null
  const buildDuration = startedAt !== null && endAt !== null ? endAt - startedAt : null

  const timeline = [
    ['创建', job.created_at],
    ['排队', job.queued_at],
    ['构建', job.started_at],
    ['渲染', job.rendering_at],
    ['完成', job.completed_at],
  ] as const

  return (
    <section className="card status-card" aria-live="polite">
      <div className="status-heading">
        <div className="status-title-copy">
          <span className={`badge status-${job.status}`}>{PDF_JOB_STATUS_LABELS[job.status]}</span>
          <h2 title={job.source_name}>{job.source_name}</h2>
          <p>{getPdfJobStageLabel(job)}</p>
        </div>
        <strong className="status-progress-value">{progress}%</strong>
      </div>

      <div
        className="progress build-progress"
        role="progressbar"
        aria-label="PDF 构建进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${getPdfJobStageLabel(job)}，${progress}%`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="duration-grid" aria-label="任务耗时">
        <div><span>总耗时</span><strong>{formatDuration(totalDuration)}</strong></div>
        <div><span>排队</span><strong>{formatDuration(queueDuration)}</strong></div>
        <div><span>构建</span><strong>{formatDuration(buildDuration)}</strong></div>
      </div>

      <ol className="compact-timeline" aria-label="任务时间线">
        {timeline.map(([label, value]) => (
          <li className={value ? 'is-complete' : ''} key={label}>
            <span aria-hidden="true" />
            <strong>{label}</strong>
            <time>{formatTime(value)}</time>
          </li>
        ))}
      </ol>

      <dl className="job-metadata">
        <div><dt>源文件</dt><dd>{job.source_name}</dd></div>
        <div><dt>导出文件</dt><dd>{job.output_filename}</dd></div>
        <div><dt>完成后</dt><dd>{autoDownload ? '自动下载' : '手动下载'}{notifyOnComplete ? ' · 通知' : ''}</dd></div>
        <div><dt>更新时间</dt><dd>{formatTime(job.updated_at)}</dd></div>
      </dl>

      {job.github_run_url && (
        <a className="actions-link" href={job.github_run_url} target="_blank" rel="noreferrer">
          查看构建日志
        </a>
      )}
      {job.error_message && <p className="error-text status-error">{job.error_message}</p>}
      <div className="row status-actions">
        {job.status === 'completed' && <button onClick={onDownload}>下载 {job.output_filename}</button>}
        {terminal && <button className="secondary" onClick={onNew}>新建任务</button>}
      </div>
    </section>
  )
}

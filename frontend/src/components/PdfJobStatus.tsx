import { useEffect, useMemo, useState } from 'react'
import type { PdfJob } from '../types/pdfJob'
import {
  formatDuration,
  getPdfJobBuildElapsedMs,
  getPdfJobElapsedMs,
  getPdfJobProgress,
} from '../utils/pdfJobProgress'
import { isTerminalPdfJobStatus, PDF_JOB_STATUS_LABELS } from '../utils/pdfJobStatus'

type Props = {
  job: PdfJob | null
  notificationSupported: boolean
  notificationsEnabled: boolean
  onEnableNotifications: () => void
  onDownload: () => void
  onNew: () => void
}

type TimelineItem = {
  key: string
  label: string
  at: string | null
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '等待中'
}

export function PdfJobStatus({
  job,
  notificationSupported,
  notificationsEnabled,
  onEnableNotifications,
  onDownload,
  onNew,
}: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!job || isTerminalPdfJobStatus(job.status)) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!job) return []
    return [
      { key: 'created', label: '创建任务', at: job.created_at },
      { key: 'uploaded', label: '文件上传完成', at: job.uploaded_at },
      { key: 'queued', label: '进入构建队列', at: job.queued_at },
      { key: 'started', label: '开始构建', at: job.started_at },
      { key: 'uploading', label: '上传生成结果', at: job.uploading_at },
      {
        key: 'terminal',
        label: job.status === 'failed' ? '构建失败' : '构建完成',
        at: job.status === 'failed' ? job.failed_at : job.completed_at,
      },
    ]
  }, [job])

  if (!job) return null

  const progress = getPdfJobProgress(job)
  const terminal = isTerminalPdfJobStatus(job.status)
  const elapsed = getPdfJobElapsedMs(job, now)
  const buildElapsed = getPdfJobBuildElapsedMs(job, now)
  const progressUpdated = formatTime(job.progress_updated_at || job.updated_at)

  return (
    <section className="card status-card" aria-live="polite">
      <div className="status-heading">
        <div>
          <p className="eyebrow">BUILD STATUS</p>
          <div className="status-title-row">
            <h2>任务进度</h2>
            <span className={`badge status-${job.status}`}>{PDF_JOB_STATUS_LABELS[job.status]}</span>
          </div>
        </div>
        <code title={job.id}>{job.id.slice(0, 8)}</code>
      </div>

      <div className="build-progress-summary">
        <div className="build-progress-copy">
          <strong>{progress.percent}%</strong>
          <span>{progress.message}</span>
        </div>
        <div
          className="build-progress-track"
          role="progressbar"
          aria-label="PDF 构建进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={`${progress.percent}%，${progress.message}`}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="build-progress-meta">
          <span>总用时：{formatDuration(elapsed)}</span>
          {buildElapsed !== null && <span>构建用时：{formatDuration(buildElapsed)}</span>}
          <span>进度更新：{progressUpdated}</span>
        </div>
      </div>

      {!terminal && (
        <div className="status-notification-row">
          <div>
            <strong>无需手动刷新</strong>
            <p>页面会自动同步构建阶段；任务结束后会立即显示结果。</p>
          </div>
          {notificationSupported && (
            <button
              type="button"
              className="secondary notification-button"
              disabled={notificationsEnabled}
              onClick={onEnableNotifications}
            >
              {notificationsEnabled ? '完成通知已开启' : '开启完成通知'}
            </button>
          )}
        </div>
      )}

      <ol className="job-timeline" aria-label="任务时间线">
        {timeline.map((item) => (
          <li className={item.at ? 'is-complete' : 'is-pending'} key={item.key}>
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              <time>{formatTime(item.at)}</time>
            </div>
          </li>
        ))}
      </ol>

      <dl className="job-details">
        <div><dt>主题</dt><dd>{job.theme}</dd></div>
        <div><dt>创建时间</dt><dd>{formatTime(job.created_at)}</dd></div>
        <div><dt>最后状态变化</dt><dd>{formatTime(job.status_changed_at || job.updated_at)}</dd></div>
        <div><dt>文件到期时间</dt><dd>{formatTime(job.expires_at)}</dd></div>
      </dl>

      {job.github_run_url && (
        <a href={job.github_run_url} target="_blank" rel="noreferrer">查看 GitHub Actions 运行日志</a>
      )}
      {job.error_message && <p className="error-text status-error">{job.error_message}</p>}
      <div className="row status-actions">
        {job.status === 'completed' && <button onClick={onDownload}>下载 PDF</button>}
        {terminal && <button className="secondary" onClick={onNew}>新建任务</button>}
      </div>
    </section>
  )
}

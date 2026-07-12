import type { PdfJob } from '../types/pdfJob'
import { getPdfJobProgress, getPdfJobStageLabel, PDF_JOB_STATUS_LABELS } from '../utils/pdfJobStatus'

type Props = {
  jobs: PdfJob[]
  loading: boolean
  lastSyncedAt: number | null
  error: string
  selectedJobId: string | null
  onRefresh: () => void
  onSelect: (job: PdfJob) => void
}

function compactDuration(job: PdfJob): string {
  const start = new Date(job.created_at).getTime()
  const end = new Date(job.completed_at || job.updated_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—'
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
}

export function PdfJobHistory({
  jobs,
  loading,
  lastSyncedAt,
  error,
  selectedJobId,
  onRefresh,
  onSelect,
}: Props) {
  const showInitialLoading = loading && jobs.length === 0
  const syncedTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null
  const syncLabel = loading
    ? '同步中'
    : error
      ? '同步失败'
      : syncedTime
        ? `${syncedTime} 已同步`
        : '尚未同步'

  return (
    <section className="card history-card" aria-busy={loading}>
      <div className="history-heading">
        <div className="history-heading-copy">
          <h2>最近任务</h2>
          <span className={`history-sync-summary${error ? ' is-error' : ''}`} role="status" aria-live="polite">
            {loading && <span className="history-inline-spinner" aria-hidden="true" />}
            {syncLabel}
          </span>
        </div>
        <button
          type="button"
          className="history-refresh"
          onClick={onRefresh}
          disabled={loading}
          aria-label={loading ? '正在同步最近任务' : '刷新最近任务'}
        >
          {loading ? '同步中' : '刷新'}
        </button>
      </div>

      {error && jobs.length > 0 && <p className="history-error" role="alert">{error}</p>}

      {showInitialLoading ? (
        <div className="history-state" role="status" aria-live="polite">
          <span className="history-state-spinner" aria-hidden="true" />
          <strong>正在加载</strong>
        </div>
      ) : jobs.length === 0 ? (
        <div className="history-state history-empty">
          <strong>{error ? '任务记录暂时不可用' : '暂无任务'}</strong>
          <p>{error || '生成的 PDF 会显示在这里。'}</p>
        </div>
      ) : (
        <div className="history-list">
          {jobs.map((job) => {
            const selected = job.id === selectedJobId
            const createdAt = new Date(job.created_at).toLocaleString()
            const progress = getPdfJobProgress(job)

            return (
              <button
                className={`history-item${selected ? ' is-selected' : ''}`}
                key={job.id}
                onClick={() => onSelect(job)}
                aria-label={`${selected ? '当前查看，' : ''}${job.source_name}，${PDF_JOB_STATUS_LABELS[job.status]}`}
                aria-pressed={selected}
              >
                <span className="history-item-topline">
                  <strong className="history-job-name" title={job.source_name}>{job.source_name}</strong>
                  <span className={`badge status-${job.status}`}>{PDF_JOB_STATUS_LABELS[job.status]}</span>
                </span>
                <span className="history-stage">{getPdfJobStageLabel(job)}</span>
                <span className="history-mini-progress" aria-label={`进度 ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </span>
                <span className="history-item-meta">
                  <time>{createdAt}</time>
                  <span>{compactDuration(job)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

import type { PdfJob } from '../types/pdfJob'
import { formatDuration, getPdfJobElapsedMs, getPdfJobProgress } from '../utils/pdfJobProgress'
import { isTerminalPdfJobStatus, PDF_JOB_STATUS_LABELS } from '../utils/pdfJobStatus'

type Props = {
  jobs: PdfJob[]
  loading: boolean
  lastSyncedAt: number | null
  error: string
  selectedJobId: string | null
  onRefresh: () => void
  onSelect: (job: PdfJob) => void
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
    ? '正在同步任务状态'
    : error
      ? '同步失败，可重试'
      : syncedTime
        ? `已于 ${syncedTime} 同步`
        : '尚未同步'

  return (
    <section className="card history-card" aria-busy={loading}>
      <div className="history-heading">
        <div className="history-heading-copy">
          <h2>最近任务</h2>
          <span
            className={`history-sync-summary${error ? ' is-error' : ''}`}
            role="status"
            aria-live="polite"
          >
            {loading && <span className="history-inline-spinner" aria-hidden="true" />}
            {syncLabel}
          </span>
        </div>
        <div className="history-heading-actions">
          {jobs.length > 0 && (
            <span className="history-count" aria-label={`共 ${jobs.length} 个任务`}>{jobs.length}</span>
          )}
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
      </div>

      {error && jobs.length > 0 && <p className="history-error" role="alert">{error}</p>}

      {showInitialLoading ? (
        <div className="history-state" role="status" aria-live="polite">
          <span className="history-state-spinner" aria-hidden="true" />
          <strong>正在加载任务记录</strong>
          <p>正在同步最近的 PDF 构建状态。</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="history-state history-empty">
          <strong>{error ? '任务记录暂时不可用' : '暂无构建记录'}</strong>
          <p>{error || '提交第一个 Markdown 文件后，任务会显示在这里。'}</p>
        </div>
      ) : (
        <div className="history-list">
          {jobs.map((job) => {
            const selected = job.id === selectedJobId
            const createdAt = new Date(job.created_at).toLocaleString()
            const progress = getPdfJobProgress(job)
            const terminal = isTerminalPdfJobStatus(job.status)
            const elapsed = formatDuration(getPdfJobElapsedMs(job))

            return (
              <button
                className={`history-item${selected ? ' is-selected' : ''}`}
                key={job.id}
                onClick={() => onSelect(job)}
                aria-label={`${selected ? '当前查看，' : ''}${PDF_JOB_STATUS_LABELS[job.status]}，${createdAt}`}
                aria-pressed={selected}
              >
                <span>{createdAt}</span>
                <strong className={`badge status-${job.status}`}>{PDF_JOB_STATUS_LABELS[job.status]}</strong>
                <span className="history-progress-summary">
                  {terminal ? `总用时 ${elapsed}` : `${progress.percent}% · ${progress.message}`}
                </span>
                <span className="history-item-meta">
                  <code>{job.id.slice(0, 8)}</code>
                  {selected && <span className="history-current">当前查看</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

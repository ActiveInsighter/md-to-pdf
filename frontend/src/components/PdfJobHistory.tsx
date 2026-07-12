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
        ? `${syncedTime} 更新`
        : '未同步'

  return (
    <section className="card history-card" aria-busy={loading}>
      <div className="section-heading history-heading">
        <div>
          <h2>最近任务</h2>
          <p>{syncLabel}</p>
        </div>
        <button
          type="button"
          className="history-refresh secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? '同步中' : '刷新'}
        </button>
      </div>

      {error && jobs.length > 0 && <p className="history-error" role="alert">{error}</p>}

      {showInitialLoading ? (
        <div className="history-state" role="status">
          <strong>正在加载任务</strong>
        </div>
      ) : jobs.length === 0 ? (
        <div className="history-state history-empty">
          <strong>{error ? '任务暂时不可用' : '还没有任务'}</strong>
          <p>{error || '生成 PDF 后会显示在这里。'}</p>
        </div>
      ) : (
        <div className="history-list">
          {jobs.map((job) => {
            const selected = job.id === selectedJobId
            const progress = getPdfJobProgress(job)
            const createdAt = new Date(job.created_at).toLocaleString()

            return (
              <button
                className={`history-item${selected ? ' is-selected' : ''}`}
                key={job.id}
                onClick={() => onSelect(job)}
                aria-label={`${job.document_name}，${PDF_JOB_STATUS_LABELS[job.status]}，${createdAt}`}
                aria-pressed={selected}
              >
                <span className="history-item-topline">
                  <strong title={job.document_name}>{job.document_name}</strong>
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

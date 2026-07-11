import type { PdfJob } from '../types/pdfJob'
import { PDF_JOB_STATUS_LABELS } from '../utils/pdfJobStatus'

type Props = {
  jobs: PdfJob[]
  loading: boolean
  selectedJobId: string | null
  onSelect: (job: PdfJob) => void
}

export function PdfJobHistory({ jobs, loading, selectedJobId, onSelect }: Props) {
  const showInitialLoading = loading && jobs.length === 0

  return (
    <section className="card history-card" aria-busy={loading}>
      <div className="history-heading">
        <h2>最近任务</h2>
        {loading ? (
          <span className="history-sync" role="status">
            <span aria-hidden="true" />
            同步中
          </span>
        ) : jobs.length > 0 ? (
          <span className="history-count" aria-label={`共 ${jobs.length} 个任务`}>{jobs.length}</span>
        ) : null}
      </div>

      {showInitialLoading ? (
        <div className="history-state" role="status" aria-live="polite">
          <span className="history-state-spinner" aria-hidden="true" />
          <strong>正在加载任务记录</strong>
          <p>正在同步最近的 PDF 构建状态。</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="history-state history-empty">
          <strong>暂无构建记录</strong>
          <p>提交第一个 Markdown 文件后，任务会显示在这里。</p>
        </div>
      ) : (
        <div className="history-list">
          {jobs.map((job) => {
            const selected = job.id === selectedJobId
            const createdAt = new Date(job.created_at).toLocaleString()

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

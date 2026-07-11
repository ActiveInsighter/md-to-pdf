import type { PdfJob } from '../types/pdfJob'
import { PDF_JOB_STATUS_LABELS } from '../utils/pdfJobStatus'

type Props = {
  jobs: PdfJob[]
  onSelect: (job: PdfJob) => void
}

export function PdfJobHistory({ jobs, onSelect }: Props) {
  return (
    <section className="card">
      <h2>最近任务</h2>
      {jobs.length === 0 ? (
        <p className="muted">还没有任务。</p>
      ) : (
        <div className="history-list">
          {jobs.map((job) => (
            <button
              className="history-item"
              key={job.id}
              onClick={() => onSelect(job)}
              aria-label={`${PDF_JOB_STATUS_LABELS[job.status]}，${new Date(job.created_at).toLocaleString()}`}
            >
              <span>{new Date(job.created_at).toLocaleString()}</span>
              <strong className={`badge status-${job.status}`}>{PDF_JOB_STATUS_LABELS[job.status]}</strong>
              <code>{job.id.slice(0, 8)}</code>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

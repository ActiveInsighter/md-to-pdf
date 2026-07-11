import { PDF_JOB_STATUS_LABELS } from '../types/pdfJob'
import type { PdfJob } from '../types/pdfJob'

type Props = { jobs: PdfJob[]; onSelect: (job: PdfJob) => void }

export function PdfJobHistory({ jobs, onSelect }: Props) {
  return (
    <section className="card" aria-labelledby="pdf-job-history-title">
      <h2 id="pdf-job-history-title">最近任务</h2>
      {jobs.length === 0 ? (
        <p className="muted" role="status">
          还没有任务。完成首次构建后，任务会显示在这里。
        </p>
      ) : (
        <div className="history-list" aria-label="最近 PDF 任务">
          {jobs.map((job) => {
            const createdAt = new Date(job.created_at).toLocaleString()
            const statusLabel = PDF_JOB_STATUS_LABELS[job.status]

            return (
              <button
                className="history-item"
                key={job.id}
                onClick={() => onSelect(job)}
                aria-label={`查看 ${createdAt} 创建的任务，状态 ${statusLabel}，编号 ${job.id.slice(0, 8)}`}
              >
                <span>{createdAt}</span>
                <strong>{statusLabel}</strong>
                <code aria-hidden="true">{job.id.slice(0, 8)}</code>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

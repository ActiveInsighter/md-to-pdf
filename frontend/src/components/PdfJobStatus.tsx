import { PDF_JOB_STATUS_LABELS } from '../types/pdfJob'
import type { PdfJob } from '../types/pdfJob'

type Props = {
  job: PdfJob | null
  onDownload: () => void
  onNew: () => void
}

export function PdfJobStatus({ job, onDownload, onNew }: Props) {
  if (!job) return null

  const statusLabel = PDF_JOB_STATUS_LABELS[job.status]

  return (
    <section className="card status-card" aria-labelledby="pdf-job-status-title">
      <div className="row spread">
        <div>
          <span
            className={`badge status-${job.status}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusLabel}
          </span>
          <h2 id="pdf-job-status-title">任务状态</h2>
        </div>
        <code aria-label={`任务编号 ${job.id}`}>{job.id}</code>
      </div>
      <dl>
        <div>
          <dt>主题</dt>
          <dd>{job.theme}</dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd>{new Date(job.created_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt>到期时间</dt>
          <dd>{new Date(job.expires_at).toLocaleString()}</dd>
        </div>
      </dl>
      {job.github_run_url && (
        <a
          href={job.github_run_url}
          target="_blank"
          rel="noreferrer"
          aria-label="在新标签页查看 GitHub Actions 运行"
        >
          查看 GitHub Actions 运行
        </a>
      )}
      {job.error_message && (
        <p className="error-text" role="alert">
          {job.error_message}
        </p>
      )}
      <div className="row">
        {job.status === 'completed' && <button onClick={onDownload}>下载 PDF</button>}
        {(job.status === 'completed' || job.status === 'failed' || job.status === 'expired') && (
          <button className="secondary" onClick={onNew}>
            重新生成
          </button>
        )}
      </div>
    </section>
  )
}

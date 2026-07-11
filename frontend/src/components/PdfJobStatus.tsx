import type { PdfJob, PdfJobStatus } from '../types/pdfJob'

const labels: Record<PdfJobStatus, string> = {
  created: '准备上传',
  uploaded: '上传完成',
  queued: '等待构建',
  building: '正在构建',
  uploading: '正在上传 PDF',
  completed: '已完成',
  failed: '构建失败',
  expired: '已过期',
}

type Props = {
  job: PdfJob | null
  onDownload: () => void
  onNew: () => void
}

export function PdfJobStatus({ job, onDownload, onNew }: Props) {
  if (!job) return null
  return (
    <section className="card status-card">
      <div className="row spread">
        <div><span className={`badge status-${job.status}`}>{labels[job.status]}</span><h2>任务状态</h2></div>
        <code>{job.id}</code>
      </div>
      <dl>
        <div><dt>主题</dt><dd>{job.theme}</dd></div>
        <div><dt>创建时间</dt><dd>{new Date(job.created_at).toLocaleString()}</dd></div>
        <div><dt>到期时间</dt><dd>{new Date(job.expires_at).toLocaleString()}</dd></div>
      </dl>
      {job.github_run_url && <a href={job.github_run_url} target="_blank" rel="noreferrer">查看 GitHub Actions 运行</a>}
      {job.error_message && <p className="error-text">{job.error_message}</p>}
      <div className="row">
        {job.status === 'completed' && <button onClick={onDownload}>下载 PDF</button>}
        {(job.status === 'completed' || job.status === 'failed' || job.status === 'expired') && <button className="secondary" onClick={onNew}>重新生成</button>}
      </div>
    </section>
  )
}

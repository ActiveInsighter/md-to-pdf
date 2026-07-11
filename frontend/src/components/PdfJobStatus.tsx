import type { PdfJob, PdfJobStatus } from '../types/pdfJob';

const STATUS_TEXT: Record<PdfJobStatus, string> = {
  created: '等待上传',
  uploading: '正在上传',
  uploaded: '等待构建',
  queued: '等待 GitHub Actions',
  processing: '正在生成 PDF',
  uploading_result: '正在上传结果',
  completed: '构建完成',
  failed: '构建失败',
  cancelled: '已取消',
};

interface PdfJobStatusProps {
  job: PdfJob | null;
  busy: boolean;
  onDownload: () => void;
  onRebuild: () => void;
}

export function PdfJobStatus({ job, busy, onDownload, onRebuild }: PdfJobStatusProps) {
  if (!job) return null;
  return (
    <section className="card status-card">
      <div className="status-header">
        <div>
          <span className={`status-pill status-${job.status}`}>{STATUS_TEXT[job.status]}</span>
          <h2>任务状态</h2>
        </div>
        <code>{job.jobId}</code>
      </div>
      <dl className="details-grid">
        <div><dt>创建时间</dt><dd>{new Date(job.createdAt).toLocaleString()}</dd></div>
        <div><dt>输入类型</dt><dd>{job.inputType?.toUpperCase() || '—'}</dd></div>
        <div><dt>运行编号</dt><dd>{job.workflowRunId || '—'}</dd></div>
        <div><dt>结果大小</dt><dd>{job.resultSize ? `${(job.resultSize / 1024 / 1024).toFixed(2)} MB` : '—'}</dd></div>
      </dl>
      {job.workflowUrl && <a className="workflow-link" href={job.workflowUrl} target="_blank" rel="noreferrer">查看 GitHub Actions 运行日志</a>}
      {job.errorMessage && <div className="error-box">{job.errorMessage}</div>}
      <div className="actions-row">
        <button type="button" className="secondary" disabled={busy} onClick={onRebuild}>重新构建</button>
        <button type="button" className="primary" disabled={busy || job.status !== 'completed'} onClick={onDownload}>下载 PDF</button>
      </div>
    </section>
  );
}

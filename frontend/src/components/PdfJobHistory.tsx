import type { PdfJob } from '../types/pdfJob';

interface PdfJobHistoryProps {
  jobs: PdfJob[];
  selectedJobId?: string;
  onSelect: (job: PdfJob) => void;
}

export function PdfJobHistory({ jobs, selectedJobId, onSelect }: PdfJobHistoryProps) {
  return (
    <section className="card history-card">
      <div className="section-heading">
        <h2>历史任务</h2>
        <span>{jobs.length} 条</span>
      </div>
      {jobs.length === 0 ? (
        <p className="empty-state">还没有构建记录。</p>
      ) : (
        <div className="history-list">
          {jobs.map((job) => (
            <button
              type="button"
              key={job.jobId}
              className={job.jobId === selectedJobId ? 'history-item selected' : 'history-item'}
              onClick={() => onSelect(job)}
            >
              <span><strong>{job.status}</strong><small>{new Date(job.createdAt).toLocaleString()}</small></span>
              <code>{job.jobId.slice(0, 8)}</code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

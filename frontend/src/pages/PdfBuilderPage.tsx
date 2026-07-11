import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  createPdfJob,
  createUploadTarget,
  getDownloadUrl,
  getPdfJob,
  listPdfJobs,
  startPdfJob,
  uploadFile,
} from '../api/pdfJobs';
import { PdfJobHistory } from '../components/PdfJobHistory';
import { PdfJobStatus } from '../components/PdfJobStatus';
import { PdfUpload } from '../components/PdfUpload';
import type { PdfJob } from '../types/pdfJob';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const TOKEN_STORAGE_KEY = 'md-to-pdf-api-token';

export function PdfBuilderPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const [file, setFile] = useState<File | null>(null);
  const [currentJob, setCurrentJob] = useState<PdfJob | null>(null);
  const [jobs, setJobs] = useState<PdfJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const tokenReady = useMemo(() => token.trim().length > 0, [token]);

  const refreshHistory = useCallback(async () => {
    if (!tokenReady) return;
    const response = await listPdfJobs(token.trim());
    setJobs(response.jobs);
  }, [token, tokenReady]);

  useEffect(() => {
    if (!tokenReady) return;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    refreshHistory().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [token, tokenReady]);

  useEffect(() => {
    if (!currentJob || TERMINAL_STATUSES.has(currentJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getPdfJob(token.trim(), currentJob.jobId);
        setCurrentJob(latest);
        setJobs((previous) => [latest, ...previous.filter((job) => job.jobId !== latest.jobId)]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [currentJob?.jobId, currentJob?.status, token]);

  async function runBuild() {
    if (!file || !tokenReady) return;
    setBusy(true);
    setError('');
    setUploadProgress(0);
    try {
      const created = await createPdfJob(token.trim());
      setCurrentJob(created);
      const target = await createUploadTarget(token.trim(), created.jobId, file);
      await uploadFile(target, file, setUploadProgress);
      const queued = await startPdfJob(token.trim(), created.jobId, target);
      setCurrentJob(queued);
      await refreshHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await refreshHistory().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!currentJob) return;
    setBusy(true);
    setError('');
    try {
      const result = await getDownloadUrl(token.trim(), currentJob.jobId);
      window.location.assign(result.downloadUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setJobs([]);
    setCurrentJob(null);
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">Cloudflare R2 · GitHub Actions</span>
          <h1>Markdown 转 PDF</h1>
          <p>上传 Markdown 或包含图片资源的 ZIP，由现有渲染器异步生成 PDF。</p>
        </div>
      </header>

      <section className="card token-card">
        <label htmlFor="api-token">访问令牌</label>
        <div className="token-row">
          <input
            id="api-token"
            type="password"
            value={token}
            placeholder="输入 Worker 中配置的 PDF_API_TOKEN"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setToken(event.target.value)}
          />
          <button type="button" className="secondary" onClick={clearToken}>清除</button>
        </div>
        <small>令牌只保存在当前浏览器会话，不会写入前端构建产物。</small>
      </section>

      {!tokenReady ? (
        <div className="notice">输入访问令牌后即可上传和查看任务。</div>
      ) : (
        <div className="layout-grid">
          <div className="main-column">
            <PdfUpload file={file} disabled={busy} uploadProgress={uploadProgress} onFileChange={setFile} onBuild={runBuild} />
            {error && <div className="error-box global-error">{error}</div>}
            <PdfJobStatus
              job={currentJob}
              busy={busy}
              onDownload={download}
              onRebuild={() => {
                setCurrentJob(null);
                setUploadProgress(0);
                setError('');
                if (file) void runBuild();
              }}
            />
          </div>
          <PdfJobHistory jobs={jobs} selectedJobId={currentJob?.jobId} onSelect={setCurrentJob} />
        </div>
      )}
    </main>
  );
}

import { FileDropField } from './FileDropField'
import type { SubmissionRecovery, UploadPhase } from '../types/upload'
import { uploadPhaseLabels } from '../types/upload'
import { validateAssetsFile, validateMarkdownFile } from '../utils/uploadFiles'

type Props = {
  markdown: File | null
  assets: File | null
  recovery: SubmissionRecovery | null
  busy: boolean
  progress: number
  phase: UploadPhase
  autoDownload: boolean
  notifyOnComplete: boolean
  onMarkdown: (file: File | null) => void
  onAssets: (file: File | null) => void
  onAutoDownload: (enabled: boolean) => void
  onNotifyOnComplete: (enabled: boolean) => void
  onStart: () => void
  onReset: () => void
}

export function PdfUpload({
  markdown,
  assets,
  recovery,
  busy,
  progress,
  phase,
  autoDownload,
  notifyOnComplete,
  onMarkdown,
  onAssets,
  onAutoDownload,
  onNotifyOnComplete,
  onStart,
  onReset,
}: Props) {
  const submitted = phase === 'submitted'
  const cancelling = phase === 'cancelling'
  const locked = busy || submitted
  const filesLocked = locked || recovery?.status === 'uploaded'
  const phaseLabel = uploadPhaseLabels[phase]
  const requiresAssets = recovery?.status === 'created' && recovery.hasAssets
  const canStart = recovery?.status === 'uploaded'
    || Boolean(markdown && (!requiresAssets || assets))

  const actionLabel = recovery
    ? recovery.status === 'uploaded'
      ? '继续启动构建'
      : '重试上传并提交'
    : '开始生成 PDF'

  return (
    <section className="card upload-card">
      <div className="upload-heading">
        <div>
          <p className="eyebrow">{recovery ? 'RECOVER PDF JOB' : 'NEW PDF JOB'}</p>
          <h2>{recovery ? '恢复未完成任务' : '新建 PDF 任务'}</h2>
        </div>
        <span className={`upload-state-badge phase-${phase}`}>{phaseLabel}</span>
      </div>

      {recovery && (
        <div className="upload-recovery-note" role="status">
          <strong>继续任务 {recovery.jobId.slice(0, 8)}</strong>
          <span>
            {recovery.status === 'uploaded'
              ? '文件已上传，将直接重新请求构建。'
              : '任务记录与存储路径已保留，请重新选择所需文件后重试。'}
          </span>
        </div>
      )}

      <div className="upload-grid">
        <FileDropField
          title="Markdown 文件"
          hint={recovery?.status === 'uploaded' ? '文件已上传，无需重新选择' : '.md 文件，最大 10 MiB'}
          accept=".md,text/markdown,text/plain"
          file={markdown}
          disabled={filesLocked}
          validate={validateMarkdownFile}
          onChange={onMarkdown}
        />
        <FileDropField
          title="资源压缩包"
          hint={recovery?.status === 'uploaded'
            ? '文件已上传，无需重新选择'
            : requiresAssets
              ? '原任务需要 ZIP，最大 50 MiB'
              : 'assets.zip，最大 50 MiB'}
          accept=".zip,application/zip"
          file={assets}
          optional={!requiresAssets}
          disabled={filesLocked}
          validate={validateAssetsFile}
          onChange={onAssets}
        />
      </div>

      <div className="options" aria-label="构建与交付选项">
        <label>
          主题
          <select value="chatgpt-light" disabled>
            <option>chatgpt-light</option>
          </select>
        </label>
        <label><input type="checkbox" checked readOnly /> Markdown 软换行</label>
        <label><input type="checkbox" checked readOnly /> PDF 书签</label>
        <label className="delivery-option">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(event) => onAutoDownload(event.target.checked)}
          />
          构建完成后自动下载
        </label>
        <label className="delivery-option">
          <input
            type="checkbox"
            checked={notifyOnComplete}
            onChange={(event) => onNotifyOnComplete(event.target.checked)}
          />
          完成后发送系统通知
        </label>
      </div>

      <div className="upload-progress-block">
        <div className="upload-progress-heading">
          <strong>文件提交进度</strong>
          <span>{submitted ? '已交给构建队列' : phaseLabel}</span>
        </div>
        <div className="upload-progress-row">
          <div
            className="progress"
            role="progressbar"
            aria-label="文件提交进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`${phaseLabel}，${progress}%`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="upload-progress-value">{progress}%</span>
        </div>
        <p className="muted upload-progress-note">
          {submitted
            ? '这里的 100% 仅表示文件已提交；PDF 实际构建进度会在下方按服务器里程碑继续更新。'
            : '此进度只表示创建任务、上传文件与提交队列的过程。'}
        </p>
      </div>

      <div className="upload-actions">
        <button disabled={locked || !canStart} onClick={onStart}>
          {submitted ? '已提交，等待构建' : busy ? phaseLabel : actionLabel}
        </button>
        {recovery && (
          <button className="secondary recovery-reset-button" disabled={busy} onClick={onReset}>
            {cancelling ? '正在取消…' : '放弃并新建'}
          </button>
        )}
        <p className="muted upload-help" role="status" aria-live="polite">
          {submitted
            ? autoDownload
              ? '可以离开当前区域；完成后页面会自动开始下载。'
              : '任务已提交，可在下方查看实时构建状态。'
            : cancelling
              ? '正在停止未启动任务并清理已上传文件。'
              : busy
                ? `${phaseLabel}，请勿关闭页面。`
                : recovery
                  ? '将复用原任务，不会创建重复记录。'
                  : '文件仅上传到私有存储，不会写入 Git 仓库。'}
        </p>
      </div>
    </section>
  )
}

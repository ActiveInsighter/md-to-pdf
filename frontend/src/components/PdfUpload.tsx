import { FileDropField } from './FileDropField'
import type { SubmissionRecovery, UploadPhase } from '../types/upload'
import { uploadPhaseLabels } from '../types/upload'
import { documentNameFromMarkdown, pdfFilenameFromMarkdown } from '../utils/documentName'
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
  const sourceFilename = recovery?.sourceFilename || markdown?.name || ''
  const documentName = recovery?.documentName
    || (sourceFilename ? documentNameFromMarkdown(sourceFilename) : '')
  const recoveryLabel = recovery?.documentName || `任务 ${recovery?.jobId.slice(0, 8) || ''}`
  const outputFilename = sourceFilename
    ? pdfFilenameFromMarkdown(sourceFilename)
    : documentName
      ? `${documentName}.pdf`
      : ''

  const actionLabel = recovery
    ? recovery.status === 'uploaded'
      ? '继续构建'
      : '重试提交'
    : '生成 PDF'

  return (
    <section className="card upload-card">
      <div className="section-heading upload-heading">
        <div>
          <h2>{recovery ? '继续未完成任务' : '上传文件'}</h2>
          <p>可点击选择，也可以将 `.md` 和 `.zip` 拖到页面任意位置。</p>
        </div>
        <span className={`upload-state-badge phase-${phase}`}>{phaseLabel}</span>
      </div>

      {documentName && (
        <div className="document-name-preview" aria-label="任务与导出文件名称">
          <div>
            <span>任务名称</span>
            <strong title={documentName}>{documentName}</strong>
          </div>
          <div>
            <span>导出文件</span>
            <code title={outputFilename}>{outputFilename}</code>
          </div>
        </div>
      )}

      {recovery && (
        <div className="upload-recovery-note" role="status">
          <strong>{recoveryLabel}</strong>
          <span>
            {recovery.status === 'uploaded'
              ? '文件已上传，将直接重新请求构建。'
              : '任务已保留，请重新选择所需文件后重试。'}
          </span>
        </div>
      )}

      <div className="upload-grid">
        <FileDropField
          title="Markdown"
          hint={recovery?.status === 'uploaded'
            ? recovery.sourceFilename || 'Markdown 文件已上传'
            : '.md，最大 10 MiB'}
          accept=".md,text/markdown,text/plain"
          file={markdown}
          disabled={filesLocked}
          validate={validateMarkdownFile}
          onChange={onMarkdown}
        />
        <FileDropField
          title="资源包"
          hint={recovery?.status === 'uploaded'
            ? recovery.hasAssets ? 'assets.zip 已上传' : '此任务没有资源包'
            : requiresAssets
              ? '.zip，原任务需要资源包'
              : '.zip，可选，最大 50 MiB'}
          accept=".zip,application/zip"
          file={assets}
          optional={!requiresAssets}
          disabled={filesLocked}
          validate={validateAssetsFile}
          onChange={onAssets}
        />
      </div>

      <div className="compact-options" aria-label="交付选项">
        <label>
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(event) => onAutoDownload(event.target.checked)}
          />
          完成后自动下载
        </label>
        <label>
          <input
            type="checkbox"
            checked={notifyOnComplete}
            onChange={(event) => onNotifyOnComplete(event.target.checked)}
          />
          浏览器通知
        </label>
        <span>浅色主题 · 软换行 · PDF 书签</span>
      </div>

      {(progress > 0 || phase !== 'idle') && (
        <div className="upload-progress-block">
          <div className="upload-progress-heading">
            <span>{submitted ? '文件已提交，下面继续显示实际构建进度' : phaseLabel}</span>
            <strong>{progress}%</strong>
          </div>
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
        </div>
      )}

      <div className="upload-actions">
        <button disabled={locked || !canStart} onClick={onStart}>
          {submitted ? '已提交' : busy ? phaseLabel : actionLabel}
        </button>
        {recovery && (
          <button className="secondary recovery-reset-button" disabled={busy} onClick={onReset}>
            {cancelling ? '正在取消…' : '放弃任务'}
          </button>
        )}
        <p className="muted upload-help" role="status" aria-live="polite">
          {submitted
            ? autoDownload
              ? '保持页面打开，完成后会自动下载。'
              : '任务已提交，可在下方查看构建状态。'
            : busy
              ? `${phaseLabel}，请勿关闭页面。`
              : '源文件只进入私有存储。'}
        </p>
      </div>
    </section>
  )
}

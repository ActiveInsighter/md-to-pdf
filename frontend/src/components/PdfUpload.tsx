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

function pdfName(sourceName: string): string {
  return sourceName.toLowerCase().endsWith('.md')
    ? `${sourceName.slice(0, -3)}.pdf`
    : `${sourceName}.pdf`
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
  const sourceName = markdown?.name || recovery?.sourceName || ''
  const outputName = recovery?.outputFilename || (sourceName ? pdfName(sourceName) : '')

  const actionLabel = recovery
    ? recovery.status === 'uploaded'
      ? '继续启动构建'
      : '重试上传并提交'
    : '生成 PDF'

  return (
    <section className="card upload-card">
      <div className="section-heading upload-heading">
        <div>
          <h2>{recovery ? '恢复未完成任务' : '创建 PDF'}</h2>
          <p>选择文件，或直接拖到页面任意位置。</p>
        </div>
        <span className={`upload-state-badge phase-${phase}`}>{phaseLabel}</span>
      </div>

      {recovery && (
        <div className="upload-recovery-note" role="status">
          <strong>{recovery.sourceName}</strong>
          <span>
            {recovery.status === 'uploaded'
              ? '源文件已上传，可以直接重新启动构建。'
              : '请重新选择同名源文件后继续。'}
          </span>
        </div>
      )}

      <div className="upload-grid">
        <FileDropField
          title="Markdown"
          hint={recovery?.status === 'uploaded' ? '文件已上传，无需重新选择' : '.md，最大 10 MiB'}
          accept=".md,text/markdown,text/plain"
          file={markdown}
          disabled={filesLocked}
          validate={validateMarkdownFile}
          onChange={onMarkdown}
        />
        <FileDropField
          title="资源包"
          hint={recovery?.status === 'uploaded'
            ? '文件已上传，无需重新选择'
            : requiresAssets
              ? '原任务需要 .zip，最大 50 MiB'
              : '.zip，最大 50 MiB'}
          accept=".zip,application/zip"
          file={assets}
          optional={!requiresAssets}
          disabled={filesLocked}
          validate={validateAssetsFile}
          onChange={onAssets}
        />
      </div>

      <div className={`filename-preview${sourceName ? ' has-name' : ''}`}>
        <div>
          <span>任务名称</span>
          <strong>{sourceName || '选择 Markdown 后自动命名'}</strong>
        </div>
        <div>
          <span>导出文件</span>
          <strong>{outputName || '—'}</strong>
        </div>
      </div>

      <div className="delivery-options" aria-label="完成后操作">
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
      </div>

      {(busy || submitted || progress > 0) && (
        <div className="upload-progress-block">
          <div className="upload-progress-heading">
            <strong>文件提交</strong>
            <span>{submitted ? '已进入构建队列' : phaseLabel}</span>
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
              ? '保持页面打开，构建完成后会自动下载。'
              : '可在下方查看实际构建进度。'
            : cancelling
              ? '正在清理未启动任务。'
              : busy
                ? `${phaseLabel}，请勿关闭页面。`
                : '源文件保存在私有存储中。'}
        </p>
      </div>
    </section>
  )
}

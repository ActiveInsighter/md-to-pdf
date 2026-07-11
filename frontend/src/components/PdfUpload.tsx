import { FileDropField } from './FileDropField'
import type { UploadPhase } from '../types/upload'
import { uploadPhaseLabels } from '../types/upload'
import { validateAssetsFile, validateMarkdownFile } from '../utils/uploadFiles'

type Props = {
  markdown: File | null
  assets: File | null
  busy: boolean
  progress: number
  phase: UploadPhase
  onMarkdown: (file: File | null) => void
  onAssets: (file: File | null) => void
  onStart: () => void
}

export function PdfUpload({
  markdown,
  assets,
  busy,
  progress,
  phase,
  onMarkdown,
  onAssets,
  onStart,
}: Props) {
  const submitted = phase === 'submitted'
  const locked = busy || submitted
  const phaseLabel = uploadPhaseLabels[phase]

  return (
    <section className="card upload-card">
      <div className="upload-heading">
        <div>
          <p className="eyebrow">NEW PDF JOB</p>
          <h2>新建 PDF 任务</h2>
        </div>
        <span className={`upload-state-badge phase-${phase}`}>{phaseLabel}</span>
      </div>

      <div className="upload-grid">
        <FileDropField
          title="Markdown 文件"
          hint=".md 文件，最大 10 MiB"
          accept=".md,text/markdown,text/plain"
          file={markdown}
          disabled={locked}
          validate={validateMarkdownFile}
          onChange={onMarkdown}
        />
        <FileDropField
          title="资源压缩包"
          hint="assets.zip，最大 50 MiB"
          accept=".zip,application/zip"
          file={assets}
          optional
          disabled={locked}
          validate={validateAssetsFile}
          onChange={onAssets}
        />
      </div>

      <div className="options" aria-label="固定构建选项">
        <label>
          主题
          <select value="chatgpt-light" disabled>
            <option>chatgpt-light</option>
          </select>
        </label>
        <label><input type="checkbox" checked readOnly /> Markdown 软换行</label>
        <label><input type="checkbox" checked readOnly /> PDF 书签</label>
      </div>

      <div className="upload-progress-row">
        <div
          className="progress"
          role="progressbar"
          aria-label="任务提交进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${phaseLabel}，${progress}%`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="upload-progress-value">{progress}%</span>
      </div>

      <div className="upload-actions">
        <button disabled={locked || !markdown} onClick={onStart}>
          {submitted ? '已提交，等待构建' : busy ? phaseLabel : '开始生成 PDF'}
        </button>
        <p className="muted upload-help" role="status" aria-live="polite">
          {submitted
            ? '任务已提交，可在下方查看实时构建状态。'
            : busy
              ? `${phaseLabel}，请勿关闭页面。`
              : '文件仅上传到私有存储，不会写入 Git 仓库。'}
        </p>
      </div>
    </section>
  )
}

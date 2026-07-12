import { type ChangeEvent, useState } from 'react'
import { FileDropField } from './FileDropField'
import type { MarkdownSource, SubmissionRecovery, UploadPhase } from '../types/upload'
import { uploadPhaseLabels } from '../types/upload'
import { documentNameFromMarkdown, pdfFilenameFromMarkdown } from '../utils/documentName'
import {
  inferMarkdownDocumentName,
  markdownFilenameFromDocumentName,
  markdownSourceToFile,
  markdownTextByteLength,
} from '../utils/markdownSource'
import { PDF_THEMES, getPdfTheme, setPdfTheme, type PdfThemeId } from '../utils/pdfThemes'
import {
  formatFileSize,
  MAX_MARKDOWN_BYTES,
  validateAssetsFile,
  validateMarkdownFile,
} from '../utils/uploadFiles'

type Props = {
  markdownSource: MarkdownSource | null
  assets: File | null
  recovery: SubmissionRecovery | null
  busy: boolean
  progress: number
  phase: UploadPhase
  autoDownload: boolean
  notifyOnComplete: boolean
  onMarkdownSource: (source: MarkdownSource | null) => void
  onAssets: (file: File | null) => void
  onAutoDownload: (enabled: boolean) => void
  onNotifyOnComplete: (enabled: boolean) => void
  onStart: () => void
  onReset: () => void
}

export function PdfUpload({
  markdownSource,
  assets,
  recovery,
  busy,
  progress,
  phase,
  autoDownload,
  notifyOnComplete,
  onMarkdownSource,
  onAssets,
  onAutoDownload,
  onNotifyOnComplete,
  onStart,
  onReset,
}: Props) {
  const [nameEdited, setNameEdited] = useState(false)
  const [theme, setTheme] = useState<PdfThemeId>(() => getPdfTheme())
  const [clipboardState, setClipboardState] = useState('')
  const submitted = phase === 'submitted'
  const cancelling = phase === 'cancelling'
  const locked = busy || submitted
  const filesLocked = locked || recovery?.status === 'uploaded'
  const phaseLabel = uploadPhaseLabels[phase]
  const requiresAssets = recovery?.status === 'created' && recovery.hasAssets
  const textSource = markdownSource?.kind === 'text' ? markdownSource : null
  const fileSource = markdownSource?.kind === 'file' ? markdownSource.file : null
  const inputMode = textSource ? 'text' : 'file'
  const markdownFile = markdownSource ? markdownSourceToFile(markdownSource) : null
  const markdownValidation = markdownFile ? validateMarkdownFile(markdownFile) : null
  const canStart = recovery?.status === 'uploaded'
    || Boolean(markdownFile && !markdownValidation && (!requiresAssets || assets))
  const sourceFilename = recovery?.sourceFilename || markdownFile?.name || ''
  const documentName = recovery?.documentName
    || (sourceFilename ? documentNameFromMarkdown(sourceFilename) : '')
  const recoveryLabel = recovery?.documentName || `任务 ${recovery?.jobId.slice(0, 8) || ''}`
  const outputFilename = sourceFilename
    ? pdfFilenameFromMarkdown(sourceFilename)
    : documentName
      ? `${documentName}.pdf`
      : ''
  const textBytes = textSource ? markdownTextByteLength(textSource.text) : 0
  const textSizeLabel = `${formatFileSize(textBytes)} / ${formatFileSize(MAX_MARKDOWN_BYTES)}`

  const actionLabel = recovery
    ? recovery.status === 'uploaded'
      ? '继续构建'
      : '重试提交'
    : '生成 PDF'

  const selectInputMode = (mode: 'file' | 'text') => {
    if (filesLocked || mode === inputMode) return
    setNameEdited(false)
    setClipboardState('')
    if (mode === 'file') {
      onMarkdownSource(null)
      return
    }

    onMarkdownSource({
      kind: 'text',
      text: '',
      filename: markdownFilenameFromDocumentName('未命名文档'),
    })
  }

  const updateMarkdownText = (text: string) => {
    const filename = nameEdited && textSource
      ? textSource.filename
      : markdownFilenameFromDocumentName(inferMarkdownDocumentName(text))
    onMarkdownSource({ kind: 'text', text, filename })
  }

  const updateDocumentName = (value: string) => {
    setNameEdited(value.trim().length > 0)
    onMarkdownSource({
      kind: 'text',
      text: textSource?.text || '',
      filename: markdownFilenameFromDocumentName(
        value || inferMarkdownDocumentName(textSource?.text || ''),
      ),
    })
  }

  const pasteClipboard = async () => {
    if (filesLocked) return
    setClipboardState('正在读取剪切板…')
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setClipboardState('剪切板中没有文本。')
        return
      }
      setNameEdited(false)
      onMarkdownSource({
        kind: 'text',
        text,
        filename: markdownFilenameFromDocumentName(inferMarkdownDocumentName(text)),
      })
      setClipboardState('已粘贴剪切板内容。')
    } catch {
      setClipboardState('浏览器未授权读取剪切板，请手动粘贴。')
    }
  }

  return (
    <section className="card upload-card">
      <div className="section-heading upload-heading">
        <div>
          <h2>{recovery ? '继续未完成任务' : '输入 Markdown'}</h2>
          <p>上传 `.md` 文件，或直接粘贴 Markdown 文本；资源图片仍可通过 ZIP 一并提交。</p>
        </div>
        <span className={`upload-state-badge phase-${phase}`}>{phaseLabel}</span>
      </div>

      <div className="input-mode-switch" role="tablist" aria-label="Markdown 输入方式">
        <button
          type="button"
          role="tab"
          aria-selected={inputMode === 'file'}
          className={inputMode === 'file' ? 'is-active' : ''}
          disabled={filesLocked}
          onClick={() => selectInputMode('file')}
        >
          上传文件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={inputMode === 'text'}
          className={inputMode === 'text' ? 'is-active' : ''}
          disabled={filesLocked}
          onClick={() => selectInputMode('text')}
        >
          粘贴文本
        </button>
        <button
          type="button"
          className="clipboard-paste-button"
          disabled={filesLocked}
          onClick={() => void pasteClipboard()}
        >
          粘贴剪切板
        </button>
      </div>
      {clipboardState && <p className="clipboard-state" role="status">{clipboardState}</p>}

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
              : '任务已保留，请重新提供 Markdown 内容和所需资源后重试。'}
          </span>
        </div>
      )}

      <div className={`upload-grid${inputMode === 'text' ? ' upload-grid-text' : ''}`}>
        {inputMode === 'file' ? (
          <FileDropField
            title="Markdown"
            hint={recovery?.status === 'uploaded'
              ? recovery.sourceFilename || 'Markdown 文件已上传'
              : '.md，最大 10 MiB'}
            accept=".md,text/markdown,text/plain"
            file={fileSource}
            disabled={filesLocked}
            validate={validateMarkdownFile}
            onChange={(file) => onMarkdownSource(file ? { kind: 'file', file } : null)}
          />
        ) : (
          <div className="markdown-text-input">
            <label className="markdown-name-field">
              <span>文档名称</span>
              <input
                type="text"
                value={documentNameFromMarkdown(textSource?.filename || '未命名文档.md')}
                maxLength={160}
                disabled={filesLocked}
                onChange={(event: ChangeEvent<HTMLInputElement>) => updateDocumentName(event.target.value)}
                placeholder="未命名文档"
              />
            </label>
            <label className="markdown-editor-field">
              <span>Markdown 内容</span>
              <textarea
                value={textSource?.text || ''}
                disabled={filesLocked}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateMarkdownText(event.target.value)}
                placeholder="# 文档标题\n\n在这里粘贴或输入 Markdown 内容……"
                spellCheck={false}
              />
            </label>
            <div className={`markdown-editor-meta${markdownValidation ? ' is-error' : ''}`}>
              <span>{markdownValidation || '文本会按 UTF-8 编码上传。'}</span>
              <strong>{textSizeLabel}</strong>
            </div>
          </div>
        )}

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
            onChange={(event: ChangeEvent<HTMLInputElement>) => onAutoDownload(event.target.checked)}
          />
          完成后自动下载
        </label>
        <label>
          <input
            type="checkbox"
            checked={notifyOnComplete}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onNotifyOnComplete(event.target.checked)}
          />
          浏览器通知
        </label>
        <label className="theme-select-label">
          <span>PDF 主题</span>
          <select
            value={theme}
            disabled={filesLocked}
            onChange={(event) => {
              const nextTheme = event.target.value as PdfThemeId
              setTheme(nextTheme)
              setPdfTheme(nextTheme)
            }}
          >
            {PDF_THEMES.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <span>{PDF_THEMES.find((item) => item.id === theme)?.description}</span>
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
              ? '保持页面打开，完成后会自动下载；也可以继续创建新任务。'
              : '任务已提交，可在下方查看构建状态。'
            : busy
              ? `${phaseLabel}，请勿关闭页面。`
              : inputMode === 'text'
                ? '粘贴内容只会作为当前任务的 Markdown 源文件上传。'
                : '源文件只进入私有存储。'}
        </p>
      </div>
    </section>
  )
}

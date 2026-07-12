import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPdfJob,
  getDownloadUrl,
  getPdfJob,
  readableError,
  startPdfJob,
  uploadAssets,
  uploadInput,
} from '../api/pdfJobs'
import { getPdfJobProgress, getPdfJobStageLabel, isTerminalPdfJobStatus } from '../utils/pdfJobStatus'
import { PDF_THEMES, getPdfTheme, setPdfTheme, type PdfThemeId } from '../utils/pdfThemes'
import { validateAssetsFile, validateMarkdownFile } from '../utils/uploadFiles'

type BatchState = 'ready' | 'creating' | 'uploading' | 'queued' | 'completed' | 'failed'

type BatchEntry = {
  key: string
  file: File
  state: BatchState
  jobId: string | null
  progress: number
  message: string
}

type Props = {
  disabled?: boolean
  onSubmitted: () => void
}

const MAX_BATCH_FILES = 20

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/\.md$/i, '.pdf')
  anchor.rel = 'noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function PdfBatchUpload({ disabled = false, onSubmitted }: Props) {
  const [entries, setEntries] = useState<BatchEntry[]>([])
  const [assets, setAssets] = useState<File | null>(null)
  const [theme, setTheme] = useState<PdfThemeId>(() => getPdfTheme())
  const [autoDownload, setAutoDownload] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const downloadedJobs = useRef(new Set<string>())

  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.jobId && !['completed', 'failed'].includes(entry.state)),
    [entries],
  )

  useEffect(() => {
    if (activeEntries.length === 0) return

    let active = true
    let polling = false
    const poll = async () => {
      if (!active || polling) return
      polling = true
      try {
        const updates = await Promise.all(activeEntries.map(async (entry) => {
          try {
            const job = await getPdfJob(entry.jobId!)
            if (autoDownload && job.status === 'completed' && !downloadedJobs.current.has(job.id)) {
              downloadedJobs.current.add(job.id)
              triggerDownload(await getDownloadUrl(job.id), job.source_filename)
            }
            return {
              key: entry.key,
              state: job.status === 'completed'
                ? 'completed' as const
                : job.status === 'failed' || job.status === 'expired'
                  ? 'failed' as const
                  : 'queued' as const,
              progress: getPdfJobProgress(job),
              message: job.error_message || getPdfJobStageLabel(job),
            }
          } catch (cause) {
            return { key: entry.key, state: entry.state, progress: entry.progress, message: readableError(cause) }
          }
        }))

        if (!active) return
        setEntries((current) => current.map((entry) => {
          const update = updates.find((candidate) => candidate.key === entry.key)
          return update ? { ...entry, ...update } : entry
        }))
        if (updates.some((update) => isTerminalPdfJobStatus(
          update.state === 'completed' ? 'completed' : update.state === 'failed' ? 'failed' : 'queued',
        ))) onSubmitted()
      } finally {
        polling = false
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [activeEntries, autoDownload, onSubmitted])

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).slice(0, MAX_BATCH_FILES)
    event.target.value = ''
    const validationError = selected.map(validateMarkdownFile).find(Boolean)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setEntries(selected.map((file) => ({
      key: fileKey(file),
      file,
      state: 'ready',
      jobId: null,
      progress: 0,
      message: '等待提交',
    })))
  }

  const selectAssets = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (file) {
      const validationError = validateAssetsFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }
    setError('')
    setAssets(file)
  }

  const updateEntry = (key: string, patch: Partial<BatchEntry>) => {
    setEntries((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry))
  }

  const submit = async () => {
    if (running || entries.length === 0) return
    setRunning(true)
    setError('')
    setPdfTheme(theme)

    await Promise.allSettled(entries.map(async (entry) => {
      try {
        updateEntry(entry.key, { state: 'creating', progress: 5, message: '创建任务' })
        const created = await createPdfJob(Boolean(assets), entry.file.name, theme)
        updateEntry(entry.key, { jobId: created.jobId, state: 'uploading', progress: 20, message: '上传 Markdown' })
        await uploadInput(created.inputPath, entry.file)

        if (assets && created.assetsPath) {
          updateEntry(entry.key, { progress: 55, message: '上传共享资源包' })
          await uploadAssets(created.assetsPath, assets)
        }

        updateEntry(entry.key, { progress: 85, message: '提交 GitHub Actions' })
        await startPdfJob(created.jobId)
        updateEntry(entry.key, { state: 'queued', progress: 100, message: '已进入构建队列' })
      } catch (cause) {
        updateEntry(entry.key, { state: 'failed', message: readableError(cause) })
      }
    }))

    setRunning(false)
    onSubmitted()
  }

  const completedCount = entries.filter((entry) => entry.state === 'completed').length
  const failedCount = entries.filter((entry) => entry.state === 'failed').length
  const overallProgress = entries.length === 0
    ? 0
    : Math.round(entries.reduce((sum, entry) => sum + entry.progress, 0) / entries.length)

  return (
    <section className="card batch-upload-card">
      <div className="section-heading">
        <div>
          <h2>批量并发构建</h2>
          <p>一次选择最多 {MAX_BATCH_FILES} 个 Markdown；每个文件会创建独立 Action，可并行构建。</p>
        </div>
        {entries.length > 0 && <strong>{overallProgress}%</strong>}
      </div>

      <div className="batch-controls">
        <label className="batch-file-picker">
          <span>选择多个 Markdown</span>
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            multiple
            disabled={disabled || running}
            onChange={selectFiles}
          />
        </label>
        <label>
          <span>共享资源包（可选）</span>
          <input type="file" accept=".zip,application/zip" disabled={disabled || running} onChange={selectAssets} />
        </label>
        <label>
          <span>PDF 主题</span>
          <select
            value={theme}
            disabled={disabled || running}
            onChange={(event) => {
              const next = event.target.value as PdfThemeId
              setTheme(next)
              setPdfTheme(next)
            }}
          >
            {PDF_THEMES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      <div className="compact-options">
        <label>
          <input type="checkbox" checked={autoDownload} onChange={(event) => setAutoDownload(event.target.checked)} />
          每个任务完成后自动下载
        </label>
        {assets && <span>共享资源：{assets.name}</span>}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      {entries.length > 0 && (
        <div className="batch-job-list" aria-live="polite">
          {entries.map((entry) => (
            <article className={`batch-job batch-${entry.state}`} key={entry.key}>
              <div>
                <strong title={entry.file.name}>{entry.file.name}</strong>
                <span>{entry.message}</span>
              </div>
              <div className="batch-job-progress">
                <span style={{ width: `${entry.progress}%` }} />
              </div>
              <b>{entry.progress}%</b>
            </article>
          ))}
        </div>
      )}

      <div className="upload-actions">
        <button disabled={disabled || running || entries.length === 0} onClick={() => void submit()}>
          {running ? '正在并发提交…' : `并发构建 ${entries.length || ''} 个 PDF`}
        </button>
        {entries.length > 0 && (
          <button className="secondary" disabled={running} onClick={() => setEntries([])}>清空列表</button>
        )}
        <p className="muted">完成 {completedCount} · 失败 {failedCount} · 总计 {entries.length}</p>
      </div>
    </section>
  )
}

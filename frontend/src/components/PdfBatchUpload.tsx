import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelPdfJob,
  createPdfJob,
  getPdfDownload,
  getPdfJob,
  readableError,
  startPdfJob,
  uploadAssets,
  uploadInput,
} from '../api/pdfJobs'
import { getPdfJobProgress, getPdfJobStageLabel } from '../utils/pdfJobStatus'
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
  anchor.download = filename
  anchor.rel = 'noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function BatchPickerIcon({ kind }: { kind: 'markdown' | 'assets' }) {
  return kind === 'markdown' ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3.5h8l4 4V20.5H6z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h4.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5h6l1.6 2H20v9.5H4z" />
      <path d="M8 13.5h8M12 11v5" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m6 6 8 8M14 6l-8 8" />
    </svg>
  )
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
    () => entries.filter((entry) => entry.jobId && entry.state === 'queued'),
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
              const download = await getPdfDownload(job.id)
              triggerDownload(download.downloadUrl, download.fileName)
            }

            const state: BatchState = job.status === 'completed'
              ? 'completed'
              : job.status === 'failed' || job.status === 'expired'
                ? 'failed'
                : 'queued'

            return {
              key: entry.key,
              state,
              progress: getPdfJobProgress(job),
              message: job.error_message || getPdfJobStageLabel(job),
            }
          } catch (cause) {
            return {
              key: entry.key,
              state: entry.state,
              progress: entry.progress,
              message: readableError(cause),
            }
          }
        }))

        if (!active) return
        const updateMap = new Map(updates.map((update) => [update.key, update]))
        setEntries((current) => current.map((entry) => {
          const update = updateMap.get(entry.key)
          return update ? { ...entry, ...update } : entry
        }))

        if (updates.some((update) => update.state === 'completed' || update.state === 'failed')) {
          onSubmitted()
        }
      } finally {
        polling = false
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 3500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [activeEntries, autoDownload, onSubmitted])

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (selected.length === 0) return

    const validationError = selected.map(validateMarkdownFile).find(Boolean)
    if (validationError) {
      setError(validationError)
      return
    }

    const currentKeys = new Set(entries.map((entry) => entry.key))
    const unique = selected.filter((file) => !currentKeys.has(fileKey(file)))
    const capacity = Math.max(0, MAX_BATCH_FILES - entries.length)
    const accepted = unique.slice(0, capacity)

    if (accepted.length === 0) {
      setError(entries.length >= MAX_BATCH_FILES
        ? `队列最多保留 ${MAX_BATCH_FILES} 个任务，请先清理已完成任务。`
        : '所选文件已经在队列中。')
      return
    }

    setEntries((current) => [
      ...current,
      ...accepted.map((file) => ({
        key: fileKey(file),
        file,
        state: 'ready' as const,
        jobId: null,
        progress: 0,
        message: '等待提交',
      })),
    ])

    const omitted = selected.length - accepted.length
    setError(omitted > 0 ? `已添加 ${accepted.length} 个文件，另有 ${omitted} 个重复或超过队列上限。` : '')
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

  const removeEntry = (entry: BatchEntry) => {
    if (running || entry.state === 'creating' || entry.state === 'uploading' || entry.state === 'queued') return
    setEntries((current) => current.filter((candidate) => candidate.key !== entry.key))
  }

  const submitEntry = async (entry: BatchEntry) => {
    try {
      if (entry.jobId) await cancelPdfJob(entry.jobId).catch(() => undefined)

      updateEntry(entry.key, {
        state: 'creating',
        jobId: null,
        progress: 5,
        message: entry.state === 'failed' ? '重新创建任务' : '创建任务',
      })
      const created = await createPdfJob(Boolean(assets), entry.file.name, theme)
      updateEntry(entry.key, {
        jobId: created.jobId,
        state: 'uploading',
        progress: 12,
        message: '上传 Markdown',
      })
      await uploadInput(created.inputPath, entry.file)

      if (assets && created.assetsPath) {
        updateEntry(entry.key, { progress: 22, message: '上传共享资源包' })
        await uploadAssets(created.assetsPath, assets)
      }

      updateEntry(entry.key, { progress: 28, message: '提交 GitHub Actions' })
      await startPdfJob(created.jobId)
      updateEntry(entry.key, {
        state: 'queued',
        progress: 30,
        message: '已进入构建队列',
      })
    } catch (cause) {
      updateEntry(entry.key, {
        state: 'failed',
        message: readableError(cause),
      })
    }
  }

  const submit = async () => {
    const candidates = entries.filter((entry) => entry.state === 'ready' || entry.state === 'failed')
    if (running || candidates.length === 0) return

    setRunning(true)
    setError('')
    setPdfTheme(theme)
    await Promise.allSettled(candidates.map(submitEntry))
    setRunning(false)
    onSubmitted()
  }

  const downloadEntry = async (entry: BatchEntry) => {
    if (!entry.jobId || entry.state !== 'completed') return
    try {
      const download = await getPdfDownload(entry.jobId)
      triggerDownload(download.downloadUrl, download.fileName)
    } catch (cause) {
      setError(readableError(cause))
    }
  }

  const readyCount = entries.filter((entry) => entry.state === 'ready' || entry.state === 'failed').length
  const activeCount = entries.filter((entry) => ['creating', 'uploading', 'queued'].includes(entry.state)).length
  const completedCount = entries.filter((entry) => entry.state === 'completed').length
  const failedCount = entries.filter((entry) => entry.state === 'failed').length
  const overallProgress = entries.length === 0
    ? 0
    : Math.round(entries.reduce((sum, entry) => sum + entry.progress, 0) / entries.length)
  const canClearAll = !running && activeCount === 0

  return (
    <section className="card batch-upload-card">
      <div className="section-heading batch-heading">
        <div>
          <span className="section-kicker">CONCURRENT QUEUE</span>
          <h2>批量并发构建</h2>
          <p>文件会追加到当前队列，不会覆盖正在构建或等待自动下载的任务。</p>
        </div>
        {entries.length > 0 && (
          <div className="batch-overall-progress" aria-label={`批量整体进度 ${overallProgress}%`}>
            <strong>{overallProgress}%</strong>
            <span>整体进度</span>
          </div>
        )}
      </div>

      <div className="batch-controls">
        <label className="batch-picker">
          <input
            className="batch-native-input"
            type="file"
            accept=".md,text/markdown,text/plain"
            multiple
            disabled={disabled || running || entries.length >= MAX_BATCH_FILES}
            onChange={selectFiles}
          />
          <span className="batch-picker-icon"><BatchPickerIcon kind="markdown" /></span>
          <span className="batch-picker-copy">
            <strong>添加 Markdown</strong>
            <small>最多保留 {MAX_BATCH_FILES} 个，支持继续追加</small>
          </span>
        </label>

        <label className="batch-picker">
          <input
            className="batch-native-input"
            type="file"
            accept=".zip,application/zip"
            disabled={disabled || running}
            onChange={selectAssets}
          />
          <span className="batch-picker-icon"><BatchPickerIcon kind="assets" /></span>
          <span className="batch-picker-copy">
            <strong>{assets ? assets.name : '共享资源包'}</strong>
            <small>{assets ? '将用于本轮新提交的任务' : '可选，ZIP 最大 50 MiB'}</small>
          </span>
        </label>

        <label className="batch-theme-field">
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
          <small>{PDF_THEMES.find((item) => item.id === theme)?.description}</small>
        </label>
      </div>

      <div className="batch-options">
        <label>
          <input type="checkbox" checked={autoDownload} onChange={(event) => setAutoDownload(event.target.checked)} />
          每个任务完成后自动下载
        </label>
        {assets && (
          <button type="button" className="text-button" disabled={running} onClick={() => setAssets(null)}>
            移除共享资源包
          </button>
        )}
      </div>

      {error && <p className="inline-message is-error" role="alert">{error}</p>}

      {entries.length > 0 && (
        <>
          <div className="batch-summary" aria-label="批量任务统计">
            <span><strong>{readyCount}</strong> 待提交</span>
            <span><strong>{activeCount}</strong> 进行中</span>
            <span><strong>{completedCount}</strong> 已完成</span>
            <span><strong>{failedCount}</strong> 需重试</span>
          </div>

          <div className="batch-job-list" aria-live="polite">
            {entries.map((entry) => {
              const removable = !['creating', 'uploading', 'queued'].includes(entry.state) && !running
              return (
                <article className={`batch-job batch-${entry.state}`} key={entry.key}>
                  <span className="batch-state-marker" aria-hidden="true" />
                  <div className="batch-job-copy">
                    <strong title={entry.file.name}>{entry.file.name}</strong>
                    <span>{entry.message}</span>
                  </div>
                  <div className="batch-job-progress-wrap">
                    <div className="batch-job-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.progress}>
                      <span style={{ width: `${entry.progress}%` }} />
                    </div>
                    <b>{entry.progress}%</b>
                  </div>
                  <div className="batch-job-actions">
                    {entry.state === 'completed' && (
                      <button type="button" className="small-button" onClick={() => void downloadEntry(entry)}>下载</button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      disabled={!removable}
                      aria-label={`移除 ${entry.file.name}`}
                      title={removable ? '从当前队列移除' : '进行中的任务需要保留以继续跟踪'}
                      onClick={() => removeEntry(entry)}
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      <div className="upload-actions batch-actions">
        <button disabled={disabled || running || readyCount === 0} onClick={() => void submit()}>
          {running ? '正在并发提交…' : readyCount > 0 ? `提交 ${readyCount} 个任务` : '没有待提交任务'}
        </button>
        {completedCount > 0 && (
          <button
            type="button"
            className="secondary"
            disabled={running}
            onClick={() => setEntries((current) => current.filter((entry) => entry.state !== 'completed'))}
          >
            清理已完成
          </button>
        )}
        {entries.length > 0 && (
          <button type="button" className="secondary" disabled={!canClearAll} onClick={() => setEntries([])}>
            清空队列
          </button>
        )}
        <p className="muted upload-help">
          {activeCount > 0 ? '队列会持续刷新真实 Action 进度，切换到单文件模式也不会停止。' : '可分多次添加文件，再统一并发提交。'}
        </p>
      </div>
    </section>
  )
}

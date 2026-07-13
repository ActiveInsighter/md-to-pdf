import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createPdfJob, startPdfJob, uploadAssets, uploadInput } from '@/features/pdf-jobs/api/pdfJobs'
import { pdfJobKeys } from '@/features/pdf-jobs/queryKeys'
import { toUserMessage } from '@/lib/errors'
import type { PdfThemeId } from '../types'
import { MAX_BATCH_FILES, validateMarkdownFile } from '../lib/files'

export type BatchEntryState = 'ready' | 'submitting' | 'submitted' | 'failed'
export type BatchEntry = {
  key: string
  file: File
  state: BatchEntryState
  jobId: string | null
  localProgress: number
  message: string
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function useBatchSubmission() {
  const [entries, setEntries] = useState<BatchEntry[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const addFiles = (files: File[]) => {
    const invalid = files.map(validateMarkdownFile).find(Boolean)
    if (invalid) return setError(invalid)
    const existing = new Set(entries.map((entry) => entry.key))
    const unique = files.filter((file) => !existing.has(fileKey(file)))
    const accepted = unique.slice(0, Math.max(0, MAX_BATCH_FILES - entries.length))
    if (accepted.length === 0) return setError(entries.length >= MAX_BATCH_FILES ? `队列最多保留 ${MAX_BATCH_FILES} 个任务。` : '所选文件已经在队列中。')
    setEntries((current) => [...current, ...accepted.map((file) => ({ key: fileKey(file), file, state: 'ready' as const, jobId: null, localProgress: 0, message: '等待提交' }))])
    setError(files.length > accepted.length ? `已添加 ${accepted.length} 个文件，其余文件重复或超过队列上限。` : '')
  }

  const update = (key: string, patch: Partial<BatchEntry>) => setEntries((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry))

  const submitOne = async (entry: BatchEntry, assets: File | null, theme: PdfThemeId) => {
    try {
      update(entry.key, { state: 'submitting', jobId: null, localProgress: 5, message: '创建任务' })
      const created = await createPdfJob(Boolean(assets), entry.file.name, theme)
      update(entry.key, { jobId: created.jobId, localProgress: 20, message: '上传 Markdown' })
      await uploadInput(created.inputPath, entry.file)
      if (assets && created.assetsPath) {
        update(entry.key, { localProgress: 55, message: '上传共享资源包' })
        await uploadAssets(created.assetsPath, assets)
      }
      update(entry.key, { localProgress: 85, message: '启动构建' })
      await startPdfJob(created.jobId)
      update(entry.key, { state: 'submitted', localProgress: 30, message: '已进入构建队列' })
    } catch (cause) {
      update(entry.key, { state: 'failed', message: toUserMessage(cause), localProgress: 0 })
    }
  }

  const submit = async (assets: File | null, theme: PdfThemeId) => {
    if (running) return
    const candidates = entries.filter((entry) => entry.state === 'ready' || entry.state === 'failed')
    if (candidates.length === 0) return
    setRunning(true)
    setError('')
    let index = 0
    const workers = Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (index < candidates.length) {
        const entry = candidates[index++]
        if (entry) await submitOne(entry, assets, theme)
      }
    })
    await Promise.all(workers)
    await queryClient.invalidateQueries({ queryKey: pdfJobKeys.lists() })
    setRunning(false)
  }

  const remove = (key: string) => setEntries((current) => current.filter((entry) => entry.key !== key || entry.state === 'submitting'))
  const clear = () => setEntries((current) => current.filter((entry) => entry.state === 'submitting'))
  const summary = useMemo(() => ({
    ready: entries.filter((entry) => entry.state === 'ready').length,
    active: entries.filter((entry) => entry.state === 'submitting' || entry.state === 'submitted').length,
    failed: entries.filter((entry) => entry.state === 'failed').length,
  }), [entries])

  return { entries, running, error, summary, addFiles, submit, remove, clear }
}

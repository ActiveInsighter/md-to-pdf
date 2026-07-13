import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  createPdfJob,
  getPdfJob,
  startPdfJob,
  uploadAssets,
  uploadInput,
} from '@/features/pdf-jobs/api/pdfJobs'
import { pdfJobKeys } from '@/features/pdf-jobs/queryKeys'
import { getJobProgress, isTerminalJob } from '@/features/pdf-jobs/status'
import { toUserMessage } from '@/lib/errors'
import type { PdfThemeId, SubmissionRecovery } from '../types'
import {
  MAX_BATCH_FILES,
  createSubmissionRecovery,
  getSubmissionRecovery,
  validateMarkdownFile,
} from '../lib/files'

export type BatchEntryState = 'ready' | 'submitting' | 'submitted' | 'failed'
export type BatchEntry = {
  key: string
  file: File
  state: BatchEntryState
  jobId: string | null
  recovery: SubmissionRecovery | null
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

    setEntries((current) => {
      const existing = new Set(current.map((entry) => entry.key))
      const unique = files.filter((file) => !existing.has(fileKey(file)))
      const accepted = unique.slice(0, Math.max(0, MAX_BATCH_FILES - current.length))

      if (accepted.length === 0) {
        setError(current.length >= MAX_BATCH_FILES
          ? `队列最多保留 ${MAX_BATCH_FILES} 个任务。`
          : '所选文件已经在队列中。')
        return current
      }

      setError(files.length > accepted.length
        ? `已添加 ${accepted.length} 个文件，其余文件重复或超过队列上限。`
        : '')

      return [
        ...current,
        ...accepted.map((file) => ({
          key: fileKey(file),
          file,
          state: 'ready' as const,
          jobId: null,
          recovery: null,
          localProgress: 0,
          message: '等待提交',
        })),
      ]
    })
  }

  const update = (key: string, patch: Partial<BatchEntry>) => {
    setEntries((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry))
  }

  const submitOne = async (entry: BatchEntry, assets: File | null, theme: PdfThemeId) => {
    let recovery = entry.recovery
    let jobId = recovery?.jobId || entry.jobId

    try {
      if (jobId && !recovery) {
        const latest = await getPdfJob(jobId)
        recovery = getSubmissionRecovery(latest)
        if (!recovery) {
          if (!isTerminalJob(latest) || latest.status === 'completed') {
            update(entry.key, {
              state: 'submitted',
              jobId,
              recovery: null,
              localProgress: getJobProgress(latest),
              message: latest.status === 'completed' ? '构建已完成' : '服务端任务仍在构建',
            })
            return
          }
          jobId = null
        }
      }

      if (!recovery) {
        update(entry.key, {
          state: 'submitting',
          jobId: null,
          recovery: null,
          localProgress: 5,
          message: '创建任务',
        })
        const created = await createPdfJob(Boolean(assets), entry.file.name, theme)
        recovery = createSubmissionRecovery(created, Boolean(assets))
        jobId = created.jobId
        update(entry.key, {
          jobId,
          recovery,
          localProgress: 20,
          message: '上传 Markdown',
        })
      } else {
        update(entry.key, {
          state: 'submitting',
          jobId: recovery.jobId,
          recovery,
          localProgress: recovery.status === 'uploaded' ? 85 : 20,
          message: recovery.status === 'uploaded' ? '继续启动构建' : '继续上传文件',
        })
      }

      if (recovery.status === 'created') {
        await uploadInput(recovery.inputPath, entry.file)
        if (recovery.hasAssets) {
          if (!assets || !recovery.assetsPath) {
            throw new Error('该任务需要原共享资源包，请重新选择 ZIP 文件后重试。')
          }
          update(entry.key, { localProgress: 55, message: '上传共享资源包' })
          await uploadAssets(recovery.assetsPath, assets)
        }
        recovery = { ...recovery, status: 'uploaded' }
        update(entry.key, { recovery, localProgress: 85, message: '启动构建' })
      }

      await startPdfJob(recovery.jobId)
      update(entry.key, {
        state: 'submitted',
        jobId: recovery.jobId,
        recovery: null,
        localProgress: 30,
        message: '已进入构建队列',
      })
    } catch (cause) {
      const message = toUserMessage(cause)
      if (jobId) {
        try {
          const latest = await getPdfJob(jobId)
          const serverRecovery = getSubmissionRecovery(latest)
          if (!serverRecovery) {
            const terminalFailure = isTerminalJob(latest) && latest.status !== 'completed'
            update(entry.key, {
              state: terminalFailure ? 'failed' : 'submitted',
              jobId: terminalFailure ? null : jobId,
              recovery: null,
              localProgress: getJobProgress(latest),
              message: latest.status === 'completed'
                ? '构建已完成'
                : latest.error_message || (terminalFailure ? '服务端任务失败，可创建新任务重试。' : message),
            })
            return
          }
          recovery = serverRecovery.status === 'created' && recovery?.status === 'uploaded'
            ? recovery
            : serverRecovery
        } catch {
          // Preserve the known recovery paths when the reconciliation request also fails.
        }
      }
      update(entry.key, {
        state: 'failed',
        jobId: jobId || null,
        recovery: recovery || null,
        message: `${message}${jobId ? ' 任务已保留，可继续重试。' : ''}`,
        localProgress: 0,
      })
    }
  }

  const submit = async (assets: File | null, theme: PdfThemeId) => {
    if (running) return
    const candidates = entries.filter((entry) => entry.state === 'ready' || entry.state === 'failed')
    if (candidates.length === 0) return

    setRunning(true)
    setError('')
    try {
      let index = 0
      const workers = Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (index < candidates.length) {
          const entry = candidates[index++]
          if (entry) await submitOne(entry, assets, theme)
        }
      })
      await Promise.all(workers)
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.lists() })
    } finally {
      setRunning(false)
    }
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

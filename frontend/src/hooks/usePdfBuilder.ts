import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  cancelPdfJob,
  createPdfJob,
  getDownloadInfo,
  getPdfJob,
  listPdfJobs,
  readableError,
  startPdfJob,
  uploadAssets,
  uploadInput,
} from '../api/pdfJobs'
import { supabase } from '../lib/supabase'
import type { AuthSessionStatus } from '../types/authSession'
import type { PdfJob } from '../types/pdfJob'
import type { SubmissionRecovery, UploadPhase } from '../types/upload'
import {
  getTerminalPdfJobRefreshKey,
  isTerminalPdfJobStatus,
} from '../utils/pdfJobStatus'
import { mergePdfJobHistory, shouldApplyPdfJobUpdate } from '../utils/pdfJobUpdates'
import { classifyPageDrop } from '../utils/pageDrop'
import {
  FALLBACK_POLL_INTERVAL_MS,
  getPdfJobPollInterval,
} from '../utils/realtimePolling'
import {
  createSubmissionRecovery,
  getSubmissionRecovery,
} from '../utils/submissionRecovery'
import { validateAssetsFile, validateMarkdownFile } from '../utils/uploadFiles'

function activeJobKey(userId: string): string {
  return `md-to-pdf-active-job:${userId}`
}

function downloadFile(href: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function usePdfBuilder() {
  const [session, setSession] = useState<Session | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>('loading')
  const [authError, setAuthError] = useState('')
  const [markdown, setMarkdown] = useState<File | null>(null)
  const [assets, setAssets] = useState<File | null>(null)
  const [job, setJob] = useState<PdfJob | null>(null)
  const [history, setHistory] = useState<PdfJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySyncedAt, setHistorySyncedAt] = useState<number | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [submissionRecovery, setSubmissionRecovery] = useState<SubmissionRecovery | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [error, setError] = useState('')
  const authAttempt = useRef(0)
  const historyAttempt = useRef(0)
  const jobContextVersion = useRef(0)
  const jobRef = useRef<PdfJob | null>(null)
  const terminalHistoryRefreshKey = useRef<string | null>(null)

  const userId = session?.user.id ?? null
  const pageDropDisabled = busy
    || uploadPhase === 'submitted'
    || submissionRecovery?.status === 'uploaded'

  const initializeAuth = useCallback(async () => {
    const attempt = ++authAttempt.current
    setAuthStatus('loading')
    setAuthError('')

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (attempt !== authAttempt.current) return

      setSession(data.session)
      setAuthStatus('ready')
    } catch (cause) {
      if (attempt !== authAttempt.current) return

      setSession(null)
      setAuthError(readableError(cause))
      setAuthStatus('error')
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    if (!userId) return

    const attempt = ++historyAttempt.current
    setHistoryLoading(true)
    setHistoryError('')

    try {
      const nextHistory = await listPdfJobs()
      if (attempt !== historyAttempt.current) return
      setHistory((current) => mergePdfJobHistory(current, nextHistory))
      setHistorySyncedAt(Date.now())
    } catch (cause) {
      if (attempt !== historyAttempt.current) return
      setHistoryError(readableError(cause))
    } finally {
      if (attempt === historyAttempt.current) setHistoryLoading(false)
    }
  }, [userId])

  const applyJobUpdate = useCallback((next: PdfJob): boolean => {
    if (!shouldApplyPdfJobUpdate(jobRef.current, next)) return false

    jobRef.current = next
    setJob(next)
    setHistory((current) => mergePdfJobHistory(current, [next]))

    const nextRecovery = getSubmissionRecovery(next)
    setSubmissionRecovery(nextRecovery)
    if (nextRecovery) {
      setProgress(0)
      setUploadPhase('failed')
    }

    const refreshKey = getTerminalPdfJobRefreshKey(next)
    if (!refreshKey) {
      if (terminalHistoryRefreshKey.current?.startsWith(`${next.id}:`)) {
        terminalHistoryRefreshKey.current = null
      }
      return true
    }

    if (terminalHistoryRefreshKey.current !== refreshKey) {
      terminalHistoryRefreshKey.current = refreshKey
      void refreshHistory()
    }
    return true
  }, [refreshHistory])

  const loadJob = useCallback(async (jobId: string): Promise<boolean> => {
    const contextVersion = jobContextVersion.current

    try {
      const next = await getPdfJob(jobId)
      if (contextVersion !== jobContextVersion.current) return false
      return applyJobUpdate(next)
    } catch (cause) {
      if (contextVersion === jobContextVersion.current) setError(readableError(cause))
      return false
    }
  }, [applyJobUpdate])

  useEffect(() => {
    let active = true

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active || event === 'INITIAL_SESSION') return

      authAttempt.current += 1
      setSession(next)
      setAuthError('')
      setAuthStatus('ready')
    })

    void initializeAuth()

    return () => {
      active = false
      authAttempt.current += 1
      data.subscription.unsubscribe()
    }
  }, [initializeAuth])

  useEffect(() => {
    historyAttempt.current += 1
    jobContextVersion.current += 1
    terminalHistoryRefreshKey.current = null
    jobRef.current = null
    setJob(null)
    setSubmissionRecovery(null)
    setMarkdown(null)
    setAssets(null)
    setProgress(0)
    setUploadPhase('idle')
    setHistorySyncedAt(null)
    setHistoryError('')

    if (!userId) {
      setHistory([])
      setHistoryLoading(false)
      return
    }

    setHistory([])
    void refreshHistory()
    try {
      const savedJobId = localStorage.getItem(activeJobKey(userId))
      if (savedJobId) void loadJob(savedJobId)
    } catch {
      // The workspace still works when local storage is unavailable.
    }
  }, [loadJob, refreshHistory, userId])

  useEffect(() => {
    if (!userId || !job || isTerminalPdfJobStatus(job.status)) return

    const jobId = job.id
    let active = true
    let polling = false
    let pollTimer: number | null = null
    let realtimeStatus = 'CONNECTING'

    const clearPollTimer = () => {
      if (pollTimer === null) return
      window.clearTimeout(pollTimer)
      pollTimer = null
    }

    const schedulePoll = (delay = getPdfJobPollInterval(realtimeStatus)) => {
      clearPollTimer()
      pollTimer = window.setTimeout(async () => {
        pollTimer = null
        if (!active) return

        if (polling) {
          schedulePoll()
          return
        }

        polling = true
        try {
          await loadJob(jobId)
        } finally {
          polling = false
          if (active) schedulePoll()
        }
      }, delay)
    }

    const channel = supabase
      .channel(`pdf-job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pdf_jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          if (!active) return
          applyJobUpdate(payload.new as PdfJob)
          schedulePoll()
        },
      )
      .subscribe((status) => {
        if (!active) return
        realtimeStatus = status
        schedulePoll()
      })

    schedulePoll(FALLBACK_POLL_INTERVAL_MS)

    return () => {
      active = false
      clearPollTimer()
      void supabase.removeChannel(channel)
    }
  }, [applyJobUpdate, job?.id, job?.status, loadJob, userId])

  const acceptDroppedFiles = useCallback((files: File[]) => {
    if (pageDropDisabled) {
      setError('当前任务正在提交或构建，暂时不能替换文件。')
      return
    }

    const selection = classifyPageDrop(files)
    if (selection.error) {
      setError(selection.error)
      return
    }

    if (submissionRecovery?.status === 'created') {
      if (selection.markdown && selection.markdown.name !== submissionRecovery.sourceName) {
        setError(`恢复任务需要原文件“${submissionRecovery.sourceName}”。如需更换文件，请先放弃该任务。`)
        return
      }
      if (selection.assets && !submissionRecovery.hasAssets) {
        setError('该恢复任务创建时未包含资源包，请先放弃任务后重新创建。')
        return
      }
    }

    if (selection.markdown) setMarkdown(selection.markdown)
    if (selection.assets) setAssets(selection.assets)
    setError('')
  }, [pageDropDisabled, submissionRecovery])

  const start = useCallback(async () => {
    if (!userId || busy || uploadPhase === 'submitted') return

    const recovery = submissionRecovery
    const needsUploads = !recovery || recovery.status === 'created'

    if (needsUploads && !markdown) {
      setError('请选择 Markdown 文件。')
      return
    }

    if (needsUploads && markdown) {
      const markdownError = validateMarkdownFile(markdown)
      if (markdownError) {
        setError(markdownError)
        return
      }
    }

    if (needsUploads && assets) {
      const assetsError = validateAssetsFile(assets)
      if (assetsError) {
        setError(assetsError)
        return
      }
    }

    if (recovery?.status === 'created' && markdown?.name !== recovery.sourceName) {
      setError(`恢复任务需要原文件“${recovery.sourceName}”。`)
      return
    }

    if (recovery?.status === 'created' && recovery.hasAssets && !assets) {
      setError('该任务需要原资源压缩包，请重新选择 ZIP 文件后重试。')
      return
    }

    if (recovery?.status === 'created' && !recovery.hasAssets && assets) {
      setError('该恢复任务创建时未包含资源包，请移除 ZIP，或放弃该任务后重新创建。')
      return
    }

    setBusy(true)
    setError('')
    setProgress(recovery?.status === 'uploaded' ? 85 : 5)
    setUploadPhase(recovery?.status === 'uploaded' ? 'starting' : recovery ? 'uploading-markdown' : 'creating')

    let target = recovery

    try {
      if (!target) {
        const created = await createPdfJob(Boolean(assets), markdown!.name)
        target = createSubmissionRecovery(created, Boolean(assets))
        setSubmissionRecovery(target)
        try {
          localStorage.setItem(activeJobKey(userId), target.jobId)
        } catch {
          // The active task is still retained in React state.
        }
      } else {
        try {
          localStorage.setItem(activeJobKey(userId), target.jobId)
        } catch {
          // The active task is still retained in React state.
        }
      }

      if (target.status === 'created') {
        setProgress(20)
        setUploadPhase('uploading-markdown')
        await uploadInput(target.inputPath, markdown!)

        if (target.hasAssets && target.assetsPath && assets) {
          setProgress(55)
          setUploadPhase('uploading-assets')
          await uploadAssets(target.assetsPath, assets)
        }
      }

      setProgress(85)
      setUploadPhase('starting')
      await startPdfJob(target.jobId)

      setProgress(100)
      setUploadPhase('submitted')
      setSubmissionRecovery(null)
      await loadJob(target.jobId)
      await refreshHistory()
    } catch (cause) {
      const failureMessage = readableError(cause)
      setError(target ? `${failureMessage} 任务已保留，可修复后重试。` : failureMessage)

      if (!target) {
        setProgress(0)
        setUploadPhase('idle')
      } else {
        setSubmissionRecovery(target)
        setProgress(0)
        setUploadPhase('failed')

        try {
          const latest = await getPdfJob(target.jobId)
          const applied = applyJobUpdate(latest)
          const reconciled = applied
            ? latest
            : jobRef.current?.id === target.jobId
              ? jobRef.current
              : null
          if (!reconciled) return

          const latestRecovery = getSubmissionRecovery(reconciled)
          if (latestRecovery) {
            setProgress(0)
            setUploadPhase('failed')
          } else if (isTerminalPdfJobStatus(reconciled.status)) {
            setProgress(0)
            setUploadPhase('idle')
          } else {
            setError('')
            setProgress(100)
            setUploadPhase('submitted')
          }

          await refreshHistory()
        } catch {
          // Keep the original failure and recovery context when reconciliation also fails.
        }
      }
    } finally {
      setBusy(false)
    }
  }, [
    applyJobUpdate,
    assets,
    busy,
    loadJob,
    markdown,
    refreshHistory,
    submissionRecovery,
    uploadPhase,
    userId,
  ])

  const download = useCallback(async () => {
    if (!job) return

    try {
      const result = await getDownloadInfo(job.id)
      downloadFile(result.downloadUrl, result.filename || job.output_filename)
    } catch (cause) {
      setError(readableError(cause))
    }
  }, [job])

  const clearWorkspace = useCallback(() => {
    if (userId) {
      try {
        localStorage.removeItem(activeJobKey(userId))
      } catch {
        // Continue clearing the in-memory workspace.
      }
    }
    jobContextVersion.current += 1
    jobRef.current = null
    setJob(null)
    setSubmissionRecovery(null)
    setMarkdown(null)
    setAssets(null)
    setProgress(0)
    setUploadPhase('idle')
    setError('')
  }, [userId])

  const reset = useCallback(async () => {
    if (busy) return

    const recovery = submissionRecovery
    if (!recovery) {
      clearWorkspace()
      return
    }

    setBusy(true)
    setError('')
    setProgress(0)
    setUploadPhase('cancelling')

    try {
      await cancelPdfJob(recovery.jobId)
      clearWorkspace()
      await refreshHistory()
    } catch (cause) {
      const cancelError = readableError(cause)

      try {
        const latest = await getPdfJob(recovery.jobId)
        const applied = applyJobUpdate(latest)
        const reconciled = applied
          ? latest
          : jobRef.current?.id === recovery.jobId
            ? jobRef.current
            : null
        if (!reconciled) return

        const latestRecovery = getSubmissionRecovery(reconciled)
        if (!latestRecovery) {
          clearWorkspace()
          await refreshHistory()
          return
        }

        setSubmissionRecovery(latestRecovery)
      } catch {
        // Preserve the original recovery context when status reconciliation also fails.
      }

      setError(`${cancelError} 未启动任务仍保留，可再次取消或继续恢复。`)
      setProgress(0)
      setUploadPhase('failed')
    } finally {
      setBusy(false)
    }
  }, [applyJobUpdate, busy, clearWorkspace, refreshHistory, submissionRecovery])

  const selectJob = useCallback((selected: PdfJob) => {
    if (jobRef.current?.id === selected.id && !shouldApplyPdfJobUpdate(jobRef.current, selected)) return

    jobContextVersion.current += 1
    jobRef.current = selected
    setJob(selected)
    const nextRecovery = getSubmissionRecovery(selected)
    setSubmissionRecovery(nextRecovery)
    setError('')

    if (nextRecovery) {
      setProgress(0)
      setUploadPhase('failed')
    } else if (isTerminalPdfJobStatus(selected.status)) {
      setProgress(0)
      setUploadPhase('idle')
    } else {
      setProgress(100)
      setUploadPhase('submitted')
    }

    if (userId) {
      try {
        localStorage.setItem(activeJobKey(userId), selected.id)
      } catch {
        // The selected task remains active in React state.
      }
    }
  }, [userId])

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(readableError(signOutError))
  }, [])

  return {
    session,
    authStatus,
    authError,
    markdown,
    assets,
    job,
    history,
    historyLoading,
    historySyncedAt,
    historyError,
    submissionRecovery,
    busy,
    progress,
    uploadPhase,
    error,
    pageDropDisabled,
    setMarkdown,
    setAssets,
    acceptDroppedFiles,
    retryAuth: initializeAuth,
    refreshHistory,
    start,
    download,
    reset,
    selectJob,
    signOut,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  createPdfJob,
  getDownloadUrl,
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

export function usePdfBuilder() {
  const [session, setSession] = useState<Session | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>('loading')
  const [authError, setAuthError] = useState('')
  const [markdown, setMarkdown] = useState<File | null>(null)
  const [assets, setAssets] = useState<File | null>(null)
  const [job, setJob] = useState<PdfJob | null>(null)
  const [history, setHistory] = useState<PdfJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [submissionRecovery, setSubmissionRecovery] = useState<SubmissionRecovery | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [error, setError] = useState('')
  const authAttempt = useRef(0)
  const historyAttempt = useRef(0)
  const terminalHistoryRefreshKey = useRef<string | null>(null)

  const userId = session?.user.id ?? null

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

    try {
      const nextHistory = await listPdfJobs()
      if (attempt !== historyAttempt.current) return
      setHistory(nextHistory)
    } catch (cause) {
      if (attempt !== historyAttempt.current) return
      setError(readableError(cause))
    } finally {
      if (attempt === historyAttempt.current) setHistoryLoading(false)
    }
  }, [userId])

  const applyJobUpdate = useCallback((next: PdfJob) => {
    setJob(next)

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
      return
    }

    if (terminalHistoryRefreshKey.current === refreshKey) return
    terminalHistoryRefreshKey.current = refreshKey
    void refreshHistory()
  }, [refreshHistory])

  const loadJob = useCallback(async (jobId: string) => {
    try {
      applyJobUpdate(await getPdfJob(jobId))
    } catch (cause) {
      setError(readableError(cause))
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
    terminalHistoryRefreshKey.current = null
    setSubmissionRecovery(null)

    if (!userId) {
      setHistory([])
      setHistoryLoading(false)
      setJob(null)
      setMarkdown(null)
      setAssets(null)
      setProgress(0)
      setUploadPhase('idle')
      return
    }

    setHistory([])
    void refreshHistory()
    const savedJobId = localStorage.getItem(activeJobKey(userId))
    if (savedJobId) void loadJob(savedJobId)
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
        const created = await createPdfJob(Boolean(assets))
        target = createSubmissionRecovery(created, Boolean(assets))
        setSubmissionRecovery(target)
        localStorage.setItem(activeJobKey(userId), target.jobId)
      } else {
        localStorage.setItem(activeJobKey(userId), target.jobId)
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
      const message = readableError(cause)
      setError(target ? `${message} 任务已保留，可修复后重试。` : message)

      if (!target) {
        setProgress(0)
        setUploadPhase('idle')
      } else {
        setSubmissionRecovery(target)
        setProgress(0)
        setUploadPhase('failed')

        try {
          const latest = await getPdfJob(target.jobId)
          applyJobUpdate(latest)

          const latestRecovery = getSubmissionRecovery(latest)
          if (latestRecovery) {
            setProgress(0)
            setUploadPhase('failed')
          } else if (isTerminalPdfJobStatus(latest.status)) {
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
      window.location.assign(await getDownloadUrl(job.id))
    } catch (cause) {
      setError(readableError(cause))
    }
  }, [job])

  const reset = useCallback(() => {
    if (userId) localStorage.removeItem(activeJobKey(userId))
    setJob(null)
    setSubmissionRecovery(null)
    setMarkdown(null)
    setAssets(null)
    setProgress(0)
    setUploadPhase('idle')
    setError('')
  }, [userId])

  const selectJob = useCallback((selected: PdfJob) => {
    const nextRecovery = getSubmissionRecovery(selected)
    setJob(selected)
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

    if (userId) localStorage.setItem(activeJobKey(userId), selected.id)
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
    submissionRecovery,
    busy,
    progress,
    uploadPhase,
    error,
    setMarkdown,
    setAssets,
    retryAuth: initializeAuth,
    start,
    download,
    reset,
    selectJob,
    signOut,
  }
}

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
import type { UploadPhase } from '../types/upload'
import { isTerminalPdfJobStatus } from '../utils/pdfJobStatus'
import {
  FALLBACK_POLL_INTERVAL_MS,
  getPdfJobPollInterval,
} from '../utils/realtimePolling'
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
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [error, setError] = useState('')
  const authAttempt = useRef(0)

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

    try {
      setHistory(await listPdfJobs())
    } catch (cause) {
      setError(readableError(cause))
    }
  }, [userId])

  const applyJobUpdate = useCallback((next: PdfJob) => {
    setJob(next)
    if (isTerminalPdfJobStatus(next.status)) {
      void refreshHistory()
    }
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
    if (!userId) {
      setHistory([])
      setJob(null)
      setMarkdown(null)
      setAssets(null)
      setProgress(0)
      setUploadPhase('idle')
      return
    }

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
    if (!markdown || !userId || uploadPhase === 'submitted') return

    const markdownError = validateMarkdownFile(markdown)
    if (markdownError) {
      setError(markdownError)
      return
    }

    if (assets) {
      const assetsError = validateAssetsFile(assets)
      if (assetsError) {
        setError(assetsError)
        return
      }
    }

    setBusy(true)
    setError('')
    setProgress(5)
    setUploadPhase('creating')

    try {
      const created = await createPdfJob(Boolean(assets))
      localStorage.setItem(activeJobKey(userId), created.jobId)

      setProgress(20)
      setUploadPhase('uploading-markdown')
      await uploadInput(created.inputPath, markdown)

      if (assets && created.assetsPath) {
        setProgress(55)
        setUploadPhase('uploading-assets')
        await uploadAssets(created.assetsPath, assets)
      }

      setProgress(85)
      setUploadPhase('starting')
      await startPdfJob(created.jobId)

      setProgress(100)
      setUploadPhase('submitted')
      await loadJob(created.jobId)
      await refreshHistory()
    } catch (cause) {
      setError(readableError(cause))
      setProgress(0)
      setUploadPhase('idle')
    } finally {
      setBusy(false)
    }
  }, [assets, loadJob, markdown, refreshHistory, uploadPhase, userId])

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
    setMarkdown(null)
    setAssets(null)
    setProgress(0)
    setUploadPhase('idle')
    setError('')
  }, [userId])

  const selectJob = useCallback((selected: PdfJob) => {
    setJob(selected)
    setError('')
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

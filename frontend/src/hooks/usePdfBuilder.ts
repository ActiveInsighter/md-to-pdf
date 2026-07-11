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
import { isTerminalPdfJobStatus } from '../utils/pdfJobStatus'

const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024
const MAX_ASSETS_BYTES = 50 * 1024 * 1024

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
      return
    }

    void refreshHistory()
    const savedJobId = localStorage.getItem(activeJobKey(userId))
    if (savedJobId) void loadJob(savedJobId)
  }, [loadJob, refreshHistory, userId])

  useEffect(() => {
    if (!userId || !job || isTerminalPdfJobStatus(job.status)) return

    const jobId = job.id
    const channel = supabase
      .channel(`pdf-job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pdf_jobs', filter: `id=eq.${jobId}` },
        (payload) => applyJobUpdate(payload.new as PdfJob),
      )
      .subscribe()

    const timer = window.setInterval(() => void loadJob(jobId), 10_000)

    return () => {
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [applyJobUpdate, job?.id, job?.status, loadJob, userId])

  const start = useCallback(async () => {
    if (!markdown || !userId) return

    if (markdown.size <= 0 || markdown.size > MAX_MARKDOWN_BYTES) {
      setError('Markdown 必须大于 0 且不超过 10 MiB。')
      return
    }
    if (assets && (assets.size <= 0 || assets.size > MAX_ASSETS_BYTES)) {
      setError('assets.zip 必须大于 0 且不超过 50 MiB。')
      return
    }

    setBusy(true)
    setError('')
    setProgress(5)

    try {
      const created = await createPdfJob(Boolean(assets))
      localStorage.setItem(activeJobKey(userId), created.jobId)
      setProgress(20)

      await uploadInput(created.inputPath, markdown)
      setProgress(assets ? 55 : 85)

      if (assets && created.assetsPath) {
        await uploadAssets(created.assetsPath, assets)
      }

      setProgress(85)
      await startPdfJob(created.jobId)
      setProgress(100)
      await loadJob(created.jobId)
      await refreshHistory()
    } catch (cause) {
      setError(readableError(cause))
    } finally {
      setBusy(false)
    }
  }, [assets, loadJob, markdown, refreshHistory, userId])

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

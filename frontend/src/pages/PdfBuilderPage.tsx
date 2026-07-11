import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createPdfJob, getDownloadUrl, getPdfJob, listPdfJobs, readableError, startPdfJob, uploadAssets, uploadInput } from '../api/pdfJobs'
import { AuthPanel } from '../components/AuthPanel'
import { PdfJobHistory } from '../components/PdfJobHistory'
import { PdfJobStatus } from '../components/PdfJobStatus'
import { PdfUpload } from '../components/PdfUpload'
import { supabase } from '../lib/supabase'
import type { PdfJob } from '../types/pdfJob'

const ACTIVE_JOB_KEY = 'md-to-pdf-active-job'
const TERMINAL = new Set(['completed', 'failed', 'expired'])

export function PdfBuilderPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [markdown, setMarkdown] = useState<File | null>(null)
  const [assets, setAssets] = useState<File | null>(null)
  const [job, setJob] = useState<PdfJob | null>(null)
  const [history, setHistory] = useState<PdfJob[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const refreshHistory = useCallback(async () => {
    if (!session) return
    try { setHistory(await listPdfJobs()) } catch (cause) { setError(readableError(cause)) }
  }, [session])

  const loadJob = useCallback(async (jobId: string) => {
    try {
      const next = await getPdfJob(jobId)
      setJob(next)
      if (TERMINAL.has(next.status)) await refreshHistory()
    } catch (cause) {
      setError(readableError(cause))
    }
  }, [refreshHistory])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setHistory([]); setJob(null); return }
    void refreshHistory()
    const saved = localStorage.getItem(ACTIVE_JOB_KEY)
    if (saved) void loadJob(saved)
  }, [session, loadJob, refreshHistory])

  useEffect(() => {
    if (!session || !job || TERMINAL.has(job.status)) return
    const channel = supabase
      .channel(`pdf-job-${job.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pdf_jobs', filter: `id=eq.${job.id}` }, (payload) => {
        setJob(payload.new as PdfJob)
      })
      .subscribe()
    const timer = window.setInterval(() => void loadJob(job.id), 10_000)
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel) }
  }, [session, job?.id, job?.status, loadJob])

  async function start() {
    if (!markdown) return
    if (markdown.size <= 0 || markdown.size > 10 * 1024 * 1024) { setError('Markdown 必须大于 0 且不超过 10 MiB。'); return }
    if (assets && (assets.size <= 0 || assets.size > 50 * 1024 * 1024)) { setError('assets.zip 必须大于 0 且不超过 50 MiB。'); return }
    setBusy(true); setError(''); setProgress(5)
    try {
      const created = await createPdfJob(Boolean(assets))
      localStorage.setItem(ACTIVE_JOB_KEY, created.jobId)
      setProgress(20)
      await uploadInput(created.inputPath, markdown)
      setProgress(assets ? 55 : 85)
      if (assets && created.assetsPath) await uploadAssets(created.assetsPath, assets)
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
  }

  async function download() {
    if (!job) return
    try { window.location.assign(await getDownloadUrl(job.id)) } catch (cause) { setError(readableError(cause)) }
  }

  function reset() {
    localStorage.removeItem(ACTIVE_JOB_KEY)
    setJob(null); setMarkdown(null); setAssets(null); setProgress(0); setError('')
  }

  if (!session) return <main className="page"><header><h1>Markdown 转 PDF</h1><p>Supabase Auth + Storage + GitHub Actions</p></header><AuthPanel /></main>

  return (
    <main className="page">
      <header className="row spread">
        <div><h1>Markdown 转 PDF</h1><p>源文件不会提交到 Git 仓库。</p></div>
        <button className="secondary" onClick={() => void supabase.auth.signOut()}>退出登录</button>
      </header>
      {error && <div className="alert">{error}</div>}
      <PdfUpload markdown={markdown} assets={assets} busy={busy} progress={progress} onMarkdown={setMarkdown} onAssets={setAssets} onStart={() => void start()} />
      <PdfJobStatus job={job} onDownload={() => void download()} onNew={reset} />
      <PdfJobHistory jobs={history} onSelect={(selected) => { setJob(selected); localStorage.setItem(ACTIVE_JOB_KEY, selected.id) }} />
    </main>
  )
}

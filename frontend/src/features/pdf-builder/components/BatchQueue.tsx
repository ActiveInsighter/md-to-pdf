import { useMemo, useState } from 'react'
import { Archive, FilePlus2, LoaderCircle, Play, Trash2, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { formatFileSize } from '@/lib/utils'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import { getJobProgress, isTerminalJob } from '@/features/pdf-jobs/status'
import { JobStatusBadge } from '@/features/pdf-jobs/components/JobStatusBadge'
import { JobActions } from '@/features/pdf-jobs/components/JobActions'
import { useJobDelivery } from '@/features/pdf-jobs/hooks/useJobDelivery'
import type { PdfJob } from '@/features/pdf-jobs/types'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MAX_BATCH_FILES, validateAssetsFile } from '../lib/files'
import { PDF_THEMES } from '../types'
import { useBatchSubmission } from '../hooks/useBatchSubmission'

function DeliveryItem({ job }: { job: PdfJob }) {
  useJobDelivery(job)
  return null
}

export function BatchQueue() {
  const batch = useBatchSubmission()
  const jobsQuery = usePdfJobs({ status: 'all', search: '' })
  const theme = useWorkspaceStore((state) => state.theme)
  const autoDownload = useWorkspaceStore((state) => state.autoDownload)
  const setTheme = useWorkspaceStore((state) => state.setTheme)
  const setAutoDownload = useWorkspaceStore((state) => state.setAutoDownload)
  const [assets, setAssets] = useState<File | null>(null)
  const [assetsError, setAssetsError] = useState('')
  const jobMap = useMemo(() => new Map((jobsQuery.data || []).map((job) => [job.id, job])), [jobsQuery.data])

  const entries = batch.entries.map((entry) => {
    const job = entry.jobId ? jobMap.get(entry.jobId) : undefined
    return { ...entry, job, progress: job ? getJobProgress(job) : entry.localProgress }
  })
  const overallProgress = entries.length === 0 ? 0 : Math.round(entries.reduce((sum, entry) => sum + entry.progress, 0) / entries.length)
  const completed = entries.filter((entry) => entry.job?.status === 'completed').length
  const active = entries.filter((entry) => entry.state === 'submitting' || (entry.job && !isTerminalJob(entry.job))).length

  const selectAssets = (file: File | null) => {
    if (!file) return setAssets(null)
    const message = validateAssetsFile(file)
    if (message) return setAssetsError(message)
    setAssets(file)
    setAssetsError('')
  }

  return (
    <Card>
      {entries.map((entry) => entry.job ? <DeliveryItem key={entry.job.id} job={entry.job} /> : null)}
      <CardHeader><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><CardTitle>批量并发构建</CardTitle><CardDescription className="mt-1">最多添加 {MAX_BATCH_FILES} 个 Markdown，限制为 3 个并发提交；任务状态统一由 Query 与 Realtime 同步。</CardDescription></div>{entries.length > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-right"><strong className="text-xl">{overallProgress}%</strong><span className="ml-2 text-sm text-muted-foreground">整体进度</span></div>}</div></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="flex min-h-28 cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 hover:bg-muted/40">
            <input className="sr-only" type="file" multiple accept=".md,text/markdown,text/plain" disabled={batch.running || batch.entries.length >= MAX_BATCH_FILES} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; batch.addFiles(files) }} />
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><FilePlus2 className="h-5 w-5" /></span><span><strong className="block">添加 Markdown</strong><small className="text-muted-foreground">支持继续追加文件</small></span>
          </label>
          <label className="flex min-h-28 cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 hover:bg-muted/40">
            <input className="sr-only" type="file" accept=".zip,application/zip" disabled={batch.running} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; selectAssets(file) }} />
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary"><Archive className="h-5 w-5" /></span><span className="min-w-0"><strong className="block break-all">{assets?.name || '共享资源包'}</strong><small className="text-muted-foreground">{assets ? formatFileSize(assets.size) : '可选 ZIP，最大 50 MiB'}</small></span>{assets && <Button type="button" size="icon" variant="ghost" className="ml-auto" onClick={(event) => { event.preventDefault(); setAssets(null) }}><X className="h-4 w-4" /></Button>}
          </label>
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor="batch-theme">PDF 主题</label><Select id="batch-theme" value={theme} disabled={batch.running} onChange={(event) => setTheme(event.target.value as typeof theme)}>{PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><label className="flex items-center gap-2 text-sm"><Checkbox checked={autoDownload} onChange={(event) => setAutoDownload(event.target.checked)} />每个任务完成后自动下载</label></div>
        </div>

        {(batch.error || assetsError) && <Alert variant="destructive"><AlertDescription>{batch.error || assetsError}</AlertDescription></Alert>}
        {entries.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg border p-3"><strong className="block text-lg">{entries.length}</strong><span className="text-xs text-muted-foreground">队列总数</span></div><div className="rounded-lg border p-3"><strong className="block text-lg">{active}</strong><span className="text-xs text-muted-foreground">进行中</span></div><div className="rounded-lg border p-3"><strong className="block text-lg">{completed}</strong><span className="text-xs text-muted-foreground">已完成</span></div><div className="rounded-lg border p-3"><strong className="block text-lg">{batch.summary.failed}</strong><span className="text-xs text-muted-foreground">提交失败</span></div></div>}

        <div className="space-y-3">{entries.map((entry) => <div key={entry.key} className="rounded-lg border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><strong className="block break-all">{entry.file.name}</strong><span className="text-xs text-muted-foreground">{formatFileSize(entry.file.size)} · {entry.message}</span></div><div className="flex items-center gap-2">{entry.job && <JobStatusBadge job={entry.job} />}<Button type="button" size="icon" variant="ghost" disabled={entry.state === 'submitting'} onClick={() => batch.remove(entry.key)} aria-label="从队列移除"><Trash2 className="h-4 w-4" /></Button></div></div><div className="mt-3 space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>{entry.job?.progress_stage || entry.message}</span><strong>{entry.progress}%</strong></div><Progress value={entry.progress} /></div>{entry.job && isTerminalJob(entry.job) && <div className="mt-3"><JobActions job={entry.job} compact /></div>}</div>)}</div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={batch.running || active > 0} onClick={batch.clear}><Trash2 className="h-4 w-4" />清理队列</Button><Button type="button" size="lg" disabled={batch.running || batch.entries.every((entry) => entry.state !== 'ready' && entry.state !== 'failed')} onClick={() => void batch.submit(assets, theme)}>{batch.running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}提交可用任务</Button></div>
      </CardContent>
    </Card>
  )
}

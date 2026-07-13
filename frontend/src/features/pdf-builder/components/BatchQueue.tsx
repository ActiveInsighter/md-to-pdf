import { useMemo, useState } from 'react'
import { Archive, FilePlus2, LoaderCircle, Play, Trash2, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { formatFileSize } from '@/lib/utils'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import { getJobProgress, isTerminalJob } from '@/features/pdf-jobs/status'
import { JobStatusBadge } from '@/features/pdf-jobs/components/JobStatusBadge'
import { JobActions } from '@/features/pdf-jobs/components/JobActions'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { MAX_BATCH_FILES, validateAssetsFile } from '../lib/files'
import { PDF_THEMES } from '../types'
import { useBatchSubmission } from '../hooks/useBatchSubmission'

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
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary">批量工作流</span>
            <CardTitle className="mt-1">批量并发构建</CardTitle>
            <CardDescription>最多添加 {MAX_BATCH_FILES} 个 Markdown；系统以 3 个并发安全提交，并统一同步任务状态。</CardDescription>
          </div>
          {entries.length > 0 && <div className="min-w-32 rounded-xl border bg-card px-4 py-3 text-left sm:text-right"><strong className="block text-2xl tabular-nums">{overallProgress}%</strong><span className="text-xs text-muted-foreground">整体进度</span></div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-5 sm:pt-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr_0.9fr]">
          <label className="group flex min-h-32 cursor-pointer items-center gap-4 rounded-xl border border-dashed bg-muted/20 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <input className="sr-only" type="file" multiple accept=".md,text/markdown,text/plain" disabled={batch.running || batch.entries.length >= MAX_BATCH_FILES} aria-describedby="batch-markdown-help" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; batch.addFiles(files) }} />
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary transition-transform group-hover:-translate-y-0.5"><FilePlus2 className="size-5" /></span>
            <span><strong className="block">添加 Markdown</strong><small id="batch-markdown-help" className="text-muted-foreground">可多选并继续追加，单个最大 10 MiB</small></span>
          </label>
          <div className="flex min-h-32 items-stretch rounded-xl border border-dashed bg-muted/20 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 p-4">
              <input className="sr-only" type="file" accept=".zip,application/zip" disabled={batch.running} aria-describedby="batch-assets-help" onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; selectAssets(file) }} />
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary"><Archive className="size-5" /></span>
              <span className="min-w-0"><strong className="block break-all">{assets?.name || '共享资源包'}</strong><small id="batch-assets-help" className="text-muted-foreground">{assets ? formatFileSize(assets.size) : '可选 ZIP，最大 50 MiB'}</small></span>
            </label>
            {assets && <Button type="button" size="icon" variant="ghost" className="mr-2 self-center" onClick={() => setAssets(null)} aria-label="移除共享资源包"><X /></Button>}
          </div>
          <Field>
            <FieldLabel htmlFor="batch-theme">PDF 主题</FieldLabel>
            <Select id="batch-theme" value={theme} disabled={batch.running} onChange={(event) => setTheme(event.target.value as typeof theme)}>{PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
            <FieldDescription>同一批次使用统一主题。</FieldDescription>
            <label className="mt-auto flex cursor-pointer items-center gap-3 rounded-lg bg-muted/30 p-3 text-sm"><Checkbox checked={autoDownload} onChange={(event) => setAutoDownload(event.target.checked)} />任务完成后自动下载</label>
          </Field>
        </div>

        {(batch.error || assetsError) && <Alert variant="destructive"><AlertDescription>{batch.error || assetsError}</AlertDescription></Alert>}
        {entries.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="批量任务概览">
            {[['队列总数', entries.length], ['进行中', active], ['已完成', completed], ['提交失败', batch.summary.failed]].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-muted/20 p-3"><dd className="text-xl font-bold tabular-nums">{value}</dd><dt className="mt-1 text-xs text-muted-foreground">{label}</dt></div>
            ))}
          </dl>
        )}

        {entries.length === 0 ? (
          <Empty>
            <EmptyMedia><FilePlus2 /></EmptyMedia>
            <div><EmptyTitle>队列还是空的</EmptyTitle><EmptyDescription className="mt-1">先添加 Markdown 文件；需要图片等相对路径资源时，再选择一个共享 ZIP。</EmptyDescription></div>
          </Empty>
        ) : (
          <ol className="space-y-3" aria-label="批量任务队列">
            {entries.map((entry) => (
              <li key={entry.key} className="rounded-xl border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><strong className="block break-all">{entry.file.name}</strong><span className="text-xs text-muted-foreground">{formatFileSize(entry.file.size)} · {entry.message}</span></div>
                  <div className="flex items-center gap-2">{entry.job && <JobStatusBadge job={entry.job} />}<Button type="button" size="icon" variant="ghost" disabled={entry.state === 'submitting'} onClick={() => batch.remove(entry.key)} aria-label={`从队列移除 ${entry.file.name}`}><Trash2 /></Button></div>
                </div>
                <div className="mt-3 space-y-2"><div className="flex justify-between gap-3 text-xs text-muted-foreground"><span className="truncate">{entry.job?.progress_stage || entry.message}</span><strong className="shrink-0 tabular-nums text-foreground">{entry.progress}%</strong></div><Progress value={entry.progress} aria-label={`${entry.file.name} 进度`} /></div>
                {entry.job && isTerminalJob(entry.job) && <div className="mt-4 border-t pt-3"><JobActions job={entry.job} compact /></div>}
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={batch.running || active > 0 || entries.length === 0} onClick={batch.clear}><Trash2 />清理队列</Button>
          <Button type="button" size="lg" disabled={batch.running || batch.entries.every((entry) => entry.state !== 'ready' && entry.state !== 'failed')} onClick={() => void batch.submit(assets, theme)}>{batch.running ? <LoaderCircle className="animate-spin" /> : <Play />}提交可用任务</Button>
        </div>
      </CardContent>
    </Card>
  )
}

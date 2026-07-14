import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { PDF_THEMES } from '@/features/pdf-builder/types'
import { JobActions } from '@/features/pdf-jobs/components/JobActions'
import { JobProgress } from '@/features/pdf-jobs/components/JobProgress'
import { JobStatusBadge } from '@/features/pdf-jobs/components/JobStatusBadge'
import { usePdfJob } from '@/features/pdf-jobs/hooks/usePdfJob'
import { canCancelJob } from '@/features/pdf-jobs/status'
import { formatDateTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-anywhere text-sm font-medium">{value}</dd>
    </div>
  )
}

export function JobDetailPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const job = usePdfJob(jobId)
  const setSelectedJobId = useWorkspaceStore((state) => state.setSelectedJobId)

  if (job.isLoading) {
    return <PageContainer aria-busy="true" aria-label="正在加载任务" className="flex flex-col gap-4"><span className="sr-only">正在加载任务…</span><Skeleton className="h-10 w-full max-w-md" /><Skeleton className="h-72 w-full" /><Skeleton className="h-48 w-full" /></PageContainer>
  }

  if (job.error || !job.data) {
    return <PageContainer><Alert variant="destructive"><AlertTitle>任务无法打开</AlertTitle><AlertDescription>{job.error instanceof Error ? job.error.message : '任务不存在或当前账号没有访问权限。'}</AlertDescription><Button className="mt-4" variant="outline" asChild><Link to="/jobs">返回任务列表</Link></Button></Alert></PageContainer>
  }

  const item = job.data
  const themeName = PDF_THEMES.find((theme) => theme.id === item.theme)?.name || item.theme
  const attemptCount = item.attempt_count || 0
  const buildAttemptLabel = attemptCount > 0 ? `第 ${attemptCount} 次构建` : '尚未构建'
  const fileDetails = [
    ['Markdown', item.source_filename],
    ['PDF', item.output_filename || `${item.document_name}.pdf`],
    ['PDF 主题', themeName],
  ]
  const taskDetails = [
    ['创建时间', formatDateTime(item.created_at)],
    ['文件保留', item.is_favorite ? '已收藏，持续保留' : formatDateTime(item.expires_at)],
    ['资源包', item.has_assets ? '已包含 ZIP 资源包' : '无资源包'],
  ]

  return (
    <PageContainer data-ui-capture="job-detail" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild><Link to="/jobs"><ArrowLeft />任务列表</Link></Button>
        <Button variant="outline" size="sm" onClick={() => void job.refetch()} disabled={job.isFetching} aria-busy={job.isFetching}>
          {job.isFetching ? <Spinner /> : <RefreshCw />}
          刷新
        </Button>
      </div>

      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusBadge job={item} />
          <span className="text-xs text-muted-foreground">{buildAttemptLabel}</span>
        </div>
        <h1 className="mt-3 max-w-5xl break-words text-2xl font-semibold tracking-tight sm:text-3xl">{item.document_name}</h1>
        <p className="mt-1 break-all text-sm text-muted-foreground">{item.source_filename}</p>
      </header>

      {item.error_message && item.status !== 'cancelled' && <Alert variant="destructive"><AlertTitle>构建失败</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{item.error_message}</AlertDescription></Alert>}
      {item.status === 'cancelled' && <Alert variant="warning"><AlertDescription>任务已取消，待上传文件会被清理。</AlertDescription></Alert>}
      {item.status === 'expired' && <Alert variant="warning"><AlertDescription>PDF 与 Markdown 源稿已超过保留期限。</AlertDescription></Alert>}
      {canCancelJob(item) && <Alert variant="warning"><AlertDescription>源文件尚未开始构建，可返回创建页继续处理或取消任务。</AlertDescription><Button className="mt-3" size="sm" onClick={() => { setSelectedJobId(item.id); navigate('/workspace') }}>继续处理</Button></Alert>}

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-muted/15">
          <div>
            <CardTitle>构建进度</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">从创建、排队到文件交付的完整状态</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{buildAttemptLabel}</span>
        </CardHeader>
        <CardContent className="p-5"><JobProgress job={item} /></CardContent>
        <CardFooter className="border-t bg-muted/15 p-4"><JobActions job={item} /></CardFooter>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="border-b"><CardTitle>文件信息</CardTitle></CardHeader>
          <CardContent className="p-5">
            <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {fileDetails.map(([label, value]) => <div key={label} className="sm:px-5 sm:first:pl-0 sm:last:pr-0"><DetailItem label={label} value={value} /></div>)}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b"><CardTitle>任务信息</CardTitle></CardHeader>
          <CardContent className="p-5">
            <dl className="divide-y">
              {taskDetails.map(([label, value]) => <DetailItem key={label} label={label} value={value} />)}
            </dl>
            <details className="mt-4 rounded-lg border bg-muted/15 px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">技术详情</summary>
              <div className="mt-3 space-y-3">
                <div className="min-w-0"><span className="block text-[11px] text-muted-foreground">任务 ID</span><code className="mt-1 block break-all font-mono text-xs">{item.id}</code></div>
                {item.github_run_url && <div><span className="block text-[11px] text-muted-foreground">GitHub Actions</span><a className="mt-1 inline-flex items-center gap-2 font-semibold text-primary hover:underline" href={item.github_run_url} target="_blank" rel="noreferrer">Run {item.github_run_id}<ExternalLink className="size-4" /></a></div>}
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

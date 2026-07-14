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

export function JobDetailPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const job = usePdfJob(jobId)
  const setSelectedJobId = useWorkspaceStore((state) => state.setSelectedJobId)

  if (job.isLoading) {
    return <PageContainer aria-busy="true" aria-label="正在加载任务" className="flex flex-col gap-4"><span className="sr-only">正在加载任务…</span><Skeleton className="h-12 w-full max-w-md" /><Skeleton className="h-72 w-full" /><Skeleton className="h-52 w-full" /></PageContainer>
  }

  if (job.error || !job.data) {
    return <PageContainer><Alert variant="destructive"><AlertTitle>任务无法打开</AlertTitle><AlertDescription>{job.error instanceof Error ? job.error.message : '任务不存在或当前账号没有访问权限。'}</AlertDescription><Button className="mt-4" variant="outline" asChild><Link to="/jobs">返回任务列表</Link></Button></Alert></PageContainer>
  }

  const item = job.data
  const themeName = PDF_THEMES.find((theme) => theme.id === item.theme)?.name || item.theme
  const details = [
    ['Markdown', item.source_filename],
    ['PDF', item.output_filename || `${item.document_name}.pdf`],
    ['主题', themeName],
    ['创建', formatDateTime(item.created_at)],
    ['保留至', item.is_favorite ? '已收藏，持续保留' : formatDateTime(item.expires_at)],
    ['资源包', item.has_assets ? '有' : '无'],
  ]

  return (
    <PageContainer data-ui-capture="job-detail" className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Button variant="ghost" className="mb-2 -ml-3" asChild><Link to="/jobs"><ArrowLeft data-icon="inline-start" />任务列表</Link></Button>
          <div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{item.document_name}</h1><JobStatusBadge job={item} /></div>
          <p className="mt-1 break-all text-sm text-muted-foreground">{item.source_filename}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void job.refetch()} disabled={job.isFetching} aria-busy={job.isFetching}>
          {job.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          刷新
        </Button>
      </div>

      {item.error_message && item.status !== 'cancelled' && <Alert variant="destructive"><AlertTitle>构建失败</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{item.error_message}</AlertDescription></Alert>}
      {item.status === 'cancelled' && <Alert variant="warning"><AlertDescription>任务已取消，待上传文件会被清理。</AlertDescription></Alert>}
      {item.status === 'expired' && <Alert variant="warning"><AlertDescription>PDF 与 Markdown 源稿已超过保留期限。</AlertDescription></Alert>}
      {canCancelJob(item) && <Alert variant="warning"><AlertDescription>源文件已保存，尚未开始构建。</AlertDescription><Button className="mt-3" onClick={() => { setSelectedJobId(item.id); navigate('/workspace') }}>返回创建页</Button></Alert>}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 border-b">
          <CardTitle>构建进度</CardTitle>
          <span className="text-xs text-muted-foreground">第 {item.attempt_count || 1} 次构建</span>
        </CardHeader>
        <CardContent className="pt-6"><JobProgress job={item} /></CardContent>
        <CardFooter className="border-t pt-5"><JobActions job={item} /></CardFooter>
      </Card>

      <Card>
        <CardHeader><CardTitle>文件信息</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-muted/10 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>)}
          </dl>
          <details className="mt-4 rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer font-semibold">技术详情</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0"><span className="block text-xs text-muted-foreground">任务 ID</span><code className="mt-1 block break-all font-mono text-xs">{item.id}</code></div>
              {item.github_run_url && <div><span className="block text-xs text-muted-foreground">GitHub Actions</span><a className="mt-1 inline-flex items-center gap-2 font-semibold text-primary hover:underline" href={item.github_run_url} target="_blank" rel="noreferrer">Run {item.github_run_id}<ExternalLink className="size-4" /></a></div>}
            </div>
          </details>
        </CardContent>
      </Card>
    </PageContainer>
  )
}

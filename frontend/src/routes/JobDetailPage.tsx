import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
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
    return <PageContainer aria-busy="true" aria-label="正在加载任务" className="flex flex-col gap-4"><span className="sr-only">正在加载任务…</span><Skeleton className="h-12 w-full max-w-md" /><Skeleton className="h-72 w-full" /><Skeleton className="h-64 w-full" /></PageContainer>
  }

  if (job.error || !job.data) {
    return <PageContainer><Alert variant="destructive"><AlertTitle>任务无法打开</AlertTitle><AlertDescription>{job.error instanceof Error ? job.error.message : '任务不存在或当前账号没有访问权限。'}</AlertDescription><Button className="mt-4" variant="outline" asChild><Link to="/jobs">返回任务列表</Link></Button></Alert></PageContainer>
  }

  const item = job.data
  const details = [
    ['PDF 文件名', item.output_filename || `${item.document_name}.pdf`],
    ['排版主题', item.theme],
    ['创建时间', formatDateTime(item.created_at)],
    ['最近更新', formatDateTime(item.updated_at)],
    ['保留至', formatDateTime(item.expires_at)],
    ['构建尝试', String(item.attempt_count || 1)],
    ['图片资源', item.has_assets ? '已包含资源包' : '无资源包'],
  ]

  return (
    <PageContainer className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Button variant="ghost" className="mb-3 -ml-3" asChild><Link to="/jobs"><ArrowLeft data-icon="inline-start" />返回任务列表</Link></Button>
          <div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{item.document_name}</h1><JobStatusBadge job={item} /></div>
          <p className="mt-2 break-all text-sm text-muted-foreground">源稿：{item.source_filename}</p>
        </div>
        <Button variant="outline" onClick={() => void job.refetch()} disabled={job.isFetching} aria-busy={job.isFetching}>
          {job.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          {job.isFetching ? '正在刷新' : '刷新状态'}
        </Button>
      </div>

      {item.error_message && item.status !== 'cancelled' && <Alert variant="destructive"><AlertTitle>任务未能完成</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{item.error_message}</AlertDescription></Alert>}
      {item.status === 'cancelled' && <Alert variant="warning"><AlertTitle>任务已取消</AlertTitle><AlertDescription>该任务在进入构建队列前已取消，输入文件已安排清理。</AlertDescription></Alert>}
      {item.status === 'expired' && <Alert variant="warning"><AlertDescription>任务产物已经过期，原下载地址不可用。请重新上传源稿创建任务。</AlertDescription></Alert>}
      {canCancelJob(item) && <Alert variant="warning"><AlertTitle>可以继续这次上传</AlertTitle><AlertDescription>任务信息仍在服务端，但浏览器无法恢复本地文件。返回工作台重新选择源稿后即可继续。</AlertDescription><Button className="mt-3" onClick={() => { setSelectedJobId(item.id); navigate('/workspace') }}>返回工作台恢复</Button></Alert>}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>构建进度</CardTitle>
          <CardDescription>节点沿同一条流程线展示，并标出从任务创建开始经过的分钟和秒数。</CardDescription>
        </CardHeader>
        <CardContent className="pt-6"><JobProgress job={item} /></CardContent>
        <CardFooter className="border-t bg-muted/10 pt-5"><JobActions job={item} /></CardFooter>
      </Card>

      <Card>
        <CardHeader><CardTitle>文档与交付</CardTitle><CardDescription>确认成品名称、主题、保留时间和构建来源。</CardDescription></CardHeader>
        <CardContent>
          <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-muted/15 p-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>)}
          </dl>
          <details className="mt-6 rounded-lg border bg-muted/20 p-4 text-sm">
            <summary className="cursor-pointer font-semibold">技术详情</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0"><span className="block text-xs text-muted-foreground">任务 ID</span><code className="mt-1 block break-all font-mono text-xs">{item.id}</code></div>
              {item.github_run_url && <div><span className="block text-xs text-muted-foreground">GitHub Actions</span><a className="mt-1 inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline" href={item.github_run_url} target="_blank" rel="noreferrer">Run {item.github_run_id}<ExternalLink className="size-4" /></a></div>}
            </div>
          </details>
        </CardContent>
      </Card>
    </PageContainer>
  )
}

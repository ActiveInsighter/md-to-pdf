import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { JobActions } from '@/features/pdf-jobs/components/JobActions'
import { JobProgress } from '@/features/pdf-jobs/components/JobProgress'
import { JobStatusBadge } from '@/features/pdf-jobs/components/JobStatusBadge'
import { usePdfJob } from '@/features/pdf-jobs/hooks/usePdfJob'
import { useJobDelivery } from '@/features/pdf-jobs/hooks/useJobDelivery'
import { canCancelJob } from '@/features/pdf-jobs/status'
import { formatDateTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function JobDetailPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const job = usePdfJob(jobId)
  const setSelectedJobId = useWorkspaceStore((state) => state.setSelectedJobId)
  useJobDelivery(job.data)

  if (job.isLoading) return <PageContainer className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-56 w-full" /><Skeleton className="h-64 w-full" /></PageContainer>
  if (job.error || !job.data) return <PageContainer><Alert variant="destructive"><AlertTitle>任务无法打开</AlertTitle><AlertDescription>{job.error instanceof Error ? job.error.message : '任务不存在或当前账号没有访问权限。'}</AlertDescription><Button className="mt-4" variant="outline" asChild><Link to="/jobs">返回任务列表</Link></Button></Alert></PageContainer>
  const item = job.data

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><Button variant="ghost" className="mb-2 -ml-3" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" />返回</Button><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-semibold tracking-tight">{item.document_name}</h1><JobStatusBadge job={item} /></div><p className="mt-1 break-all text-sm text-muted-foreground">{item.source_filename}</p></div><Button variant="outline" onClick={() => void job.refetch()} disabled={job.isFetching}><RefreshCw className={`h-4 w-4 ${job.isFetching ? 'animate-spin' : ''}`} />刷新</Button></div>

      {item.error_message && <Alert variant="destructive"><AlertTitle>任务失败原因</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{item.error_message}</AlertDescription></Alert>}
      {item.status === 'expired' && <Alert variant="warning"><AlertDescription>任务产物已经过期，原下载地址不可用。请使用“重试”创建新任务。</AlertDescription></Alert>}
      {canCancelJob(item) && <Alert variant="warning"><AlertTitle>未启动任务恢复</AlertTitle><AlertDescription>服务端保留了任务上下文，但浏览器无法恢复尚未上传的本地 File 对象。继续前请重新选择源文件。</AlertDescription><Button className="mt-3" onClick={() => { setSelectedJobId(item.id); navigate('/workspace') }}>返回工作台恢复</Button></Alert>}

      <Card><CardHeader><CardTitle>构建进度</CardTitle></CardHeader><CardContent className="space-y-5"><JobProgress job={item} /><JobActions job={item} /></CardContent></Card>
      <Card><CardHeader><CardTitle>任务详情</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
        ['任务 ID', item.id], ['PDF 文件名', item.output_filename || `${item.document_name}.pdf`], ['主题', item.theme], ['创建时间', formatDateTime(item.created_at)], ['开始时间', formatDateTime(item.started_at)], ['完成时间', formatDateTime(item.completed_at)], ['过期时间', formatDateTime(item.expires_at)], ['尝试次数', String(item.attempt_count || 1)], ['资源包', item.has_assets ? '已包含' : '无'],
      ].map(([label, value]) => <div key={label} className="min-w-0"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block break-all font-medium">{value}</strong></div>)}{item.github_run_url && <div><span className="block text-xs text-muted-foreground">GitHub Actions</span><a className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline" href={item.github_run_url} target="_blank" rel="noreferrer">Run {item.github_run_id}<ExternalLink className="h-3.5 w-3.5" /></a></div>}</CardContent></Card>
      <Separator />
    </PageContainer>
  )
}

import { CircleCheckBig, Files, Heart, LoaderCircle, PlusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '@/components/layout/PageContainer'
import { SingleJobForm } from '@/features/pdf-builder/components/SingleJobForm'
import { BatchQueue } from '@/features/pdf-builder/components/BatchQueue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import { usePdfJob } from '@/features/pdf-jobs/hooks/usePdfJob'
import { getSubmissionRecovery } from '@/features/pdf-builder/lib/files'
import { JobList } from '@/features/pdf-jobs/components/JobList'
import { JobProgress } from '@/features/pdf-jobs/components/JobProgress'
import { JobStatusBadge } from '@/features/pdf-jobs/components/JobStatusBadge'
import { JobActions } from '@/features/pdf-jobs/components/JobActions'
import { isTerminalJob } from '@/features/pdf-jobs/status'
import { useJobDelivery } from '@/features/pdf-jobs/hooks/useJobDelivery'

export function WorkspacePage() {
  const mode = useWorkspaceStore((state) => state.mode)
  const setMode = useWorkspaceStore((state) => state.setMode)
  const selectedJobId = useWorkspaceStore((state) => state.selectedJobId)
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  const jobs = usePdfJobs({ status: 'all', search: '' })
  const selectedJob = usePdfJob(selectedJobId)
  useJobDelivery(selectedJob.data)
  const allJobs = jobs.data || []
  const recovery = getSubmissionRecovery(selectedJob.data)
  const metrics = [
    [LoaderCircle, '进行中', allJobs.filter((job) => !isTerminalJob(job)).length],
    [CircleCheckBig, '已完成', allJobs.filter((job) => job.status === 'completed').length],
    [Heart, '已收藏', allJobs.filter((job) => job.is_favorite).length],
  ] as const

  return (
    <PageContainer className="space-y-6">
      <section className="workspace-hero flex flex-col justify-between gap-5 rounded-xl border bg-white p-6 shadow-panel sm:p-8 lg:flex-row lg:items-center">
        <div><span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">PDF Workspace</span><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">生成、跟踪并管理你的 PDF</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">单个文档适合精细配置，批量队列适合并发处理。两种模式共享任务 Query、Realtime 缓存与统一状态展示。</p></div>
        <div className="grid grid-cols-3 gap-3">{metrics.map(([Icon, label, value]) => <div key={label} className="min-w-24 rounded-lg border bg-slate-50 px-4 py-3 text-center"><Icon className="mx-auto h-4 w-4 text-primary" /><strong className="mt-1 block text-xl">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>)}</div>
      </section>

      {realtimeConnection === 'disconnected' && <Alert variant="warning"><AlertDescription>Realtime 当前不可用，页面已自动切换为轮询刷新；任务终态后会停止轮询。</AlertDescription></Alert>}

      <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><TabsList><TabsTrigger value="single"><PlusCircle className="mr-2 h-4 w-4" />单文件</TabsTrigger><TabsTrigger value="batch"><Files className="mr-2 h-4 w-4" />批量并发</TabsTrigger></TabsList><Button asChild variant="outline"><Link to="/jobs">管理全部任务</Link></Button></div>
        <TabsContent value="single"><SingleJobForm recovery={recovery} /></TabsContent>
        <TabsContent value="batch"><BatchQueue /></TabsContent>
      </Tabs>

      {selectedJob.data && <Card><CardContent className="space-y-4 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">当前任务</span><h2 className="mt-1 break-words text-lg font-semibold">{selectedJob.data.document_name}</h2></div><JobStatusBadge job={selectedJob.data} /></div><JobProgress job={selectedJob.data} /><JobActions job={selectedJob.data} /></CardContent></Card>}

      <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">最近任务</h2><p className="text-sm text-muted-foreground">最近创建的 5 个任务。</p></div><Button asChild variant="ghost"><Link to="/jobs">查看全部</Link></Button></div><JobList jobs={allJobs.slice(0, 5)} loading={jobs.isLoading} /></section>
    </PageContainer>
  )
}

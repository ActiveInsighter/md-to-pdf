import { ArrowDown, CircleCheckBig, Files, Heart, LoaderCircle, PlusCircle, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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

export function WorkspacePage() {
  const mode = useWorkspaceStore((state) => state.mode)
  const setMode = useWorkspaceStore((state) => state.setMode)
  const selectedJobId = useWorkspaceStore((state) => state.selectedJobId)
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  const jobs = usePdfJobs({ status: 'all', search: '' })
  const selectedJob = usePdfJob(selectedJobId)
  const allJobs = jobs.data || []
  const recovery = getSubmissionRecovery(selectedJob.data)
  const metrics = [
    { icon: LoaderCircle, label: '进行中', value: allJobs.filter((job) => !isTerminalJob(job)).length },
    { icon: CircleCheckBig, label: '已完成', value: allJobs.filter((job) => job.status === 'completed').length },
    { icon: Heart, label: '已收藏', value: allJobs.filter((job) => job.is_favorite).length },
  ] as const

  return (
    <PageContainer className="flex flex-col gap-7">
      <section className="paper-rule relative overflow-hidden rounded-2xl border bg-card/90 p-5 shadow-panel sm:p-8 lg:p-10" aria-labelledby="workspace-title">
        <div aria-hidden="true" className="absolute -right-16 -top-20 size-64 rounded-full bg-accent/70 blur-3xl" />
        <div className="relative grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/75 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary"><ShieldCheck className="size-3.5" />私有构建空间</div>
            <h1 id="workspace-title" className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl lg:text-5xl">把内容准备好，其余步骤清楚地交给工作台。</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">单份文档可以精细配置，批量模式可以同时处理多份源稿。创建、构建、交付与历史记录始终保持在同一条清晰路径上。</p>
            <Button asChild size="lg" className="mt-6"><a href="#builder">开始创建 PDF<ArrowDown data-icon="inline-end" /></a></Button>
          </div>
          <dl className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
            {metrics.map(({ icon: Icon, label, value }) => (
              <div key={label} className="min-w-0 rounded-xl border bg-background/75 px-2 py-4 text-center backdrop-blur-sm sm:px-4">
                <Icon aria-hidden="true" className="mx-auto size-4 text-primary" />
                <dd className="mt-2 text-2xl font-bold tabular-nums">{value}</dd>
                <dt className="mt-1 truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {realtimeConnection === 'disconnected' && <Alert variant="warning"><AlertDescription>实时连接暂时不可用，工作台已自动改用定时刷新；任务完成后会停止刷新。</AlertDescription></Alert>}

      <Tabs id="builder" value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="single"><PlusCircle />单文件</TabsTrigger>
            <TabsTrigger value="batch"><Files />批量处理</TabsTrigger>
          </TabsList>
          <Button asChild variant="outline"><Link to="/jobs">管理全部任务</Link></Button>
        </div>
        <TabsContent value="single"><SingleJobForm recovery={recovery} /></TabsContent>
        <TabsContent value="batch"><BatchQueue /></TabsContent>
      </Tabs>

      {selectedJob.data && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">当前任务</span><CardTitle className="mt-1 break-words">{selectedJob.data.document_name}</CardTitle><CardDescription>这里会持续显示服务端确认的最新阶段与耗时。</CardDescription></div>
            <JobStatusBadge job={selectedJob.data} />
          </CardHeader>
          <CardContent><JobProgress job={selectedJob.data} /></CardContent>
          <CardFooter><JobActions job={selectedJob.data} /></CardFooter>
        </Card>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="recent-jobs-title">
        <div className="flex items-end justify-between gap-4">
          <div><h2 id="recent-jobs-title" className="text-2xl font-semibold">最近任务</h2><p className="mt-1 text-sm text-muted-foreground">继续打开最近创建的 5 个任务。</p></div>
          <Button asChild variant="ghost"><Link to="/jobs">查看全部</Link></Button>
        </div>
        <JobList jobs={allJobs.slice(0, 5)} loading={jobs.isLoading} />
      </section>
    </PageContainer>
  )
}

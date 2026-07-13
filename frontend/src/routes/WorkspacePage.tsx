import { Files, PlusCircle } from 'lucide-react'
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

export function WorkspacePage() {
  const mode = useWorkspaceStore((state) => state.mode)
  const setMode = useWorkspaceStore((state) => state.setMode)
  const selectedJobId = useWorkspaceStore((state) => state.selectedJobId)
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  const jobs = usePdfJobs({ status: 'all', search: '' })
  const selectedJob = usePdfJob(selectedJobId)
  const allJobs = jobs.data || []
  const recovery = getSubmissionRecovery(selectedJob.data)

  return (
    <PageContainer data-ui-capture="authenticated-workspace" className="flex flex-col gap-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">创建 PDF</h1>
          <p className="mt-1 text-sm text-muted-foreground">源文件先上传，确认后再启动构建。</p>
        </div>
        <Button asChild variant="outline"><Link to="/jobs">管理全部任务</Link></Button>
      </div>

      {realtimeConnection === 'disconnected' && <Alert variant="warning"><AlertDescription>实时连接暂时不可用，工作台已自动改用定时刷新；任务完成后会停止刷新。</AlertDescription></Alert>}

      <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto">
          <TabsTrigger value="single"><PlusCircle />单文件</TabsTrigger>
          <TabsTrigger value="batch"><Files />批量处理</TabsTrigger>
        </TabsList>
        <TabsContent value="single"><SingleJobForm recovery={recovery} /></TabsContent>
        <TabsContent value="batch"><BatchQueue /></TabsContent>
      </Tabs>

      {selectedJob.data && selectedJob.data.status !== 'created' && selectedJob.data.status !== 'uploaded' && (
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

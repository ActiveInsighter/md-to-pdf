import { Files, PlusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
    <PageContainer data-ui-capture="authenticated-workspace" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">创建 PDF</h1>
        <Button asChild variant="outline"><Link to="/jobs">全部任务</Link></Button>
      </div>

      {realtimeConnection === 'disconnected' && <Alert variant="warning"><AlertDescription>实时连接暂时不可用，当前使用定时刷新。</AlertDescription></Alert>}

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
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="min-w-0 truncate">{selectedJob.data.document_name}</CardTitle>
            <JobStatusBadge job={selectedJob.data} />
          </CardHeader>
          <CardContent><JobProgress job={selectedJob.data} /></CardContent>
          <CardFooter><JobActions job={selectedJob.data} /></CardFooter>
        </Card>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="recent-jobs-title">
        <div className="flex items-center justify-between gap-4">
          <h2 id="recent-jobs-title" className="text-xl font-semibold">最近任务</h2>
          <Button asChild variant="ghost" size="sm"><Link to="/jobs">查看全部</Link></Button>
        </div>
        <JobList jobs={allJobs.slice(0, 5)} loading={jobs.isLoading} showProgress={false} />
      </section>
    </PageContainer>
  )
}

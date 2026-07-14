import { Files, PlusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '@/components/layout/PageContainer'
import { SingleJobForm } from '@/features/pdf-builder/components/SingleJobForm'
import { BatchQueue } from '@/features/pdf-builder/components/BatchQueue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import { usePdfJob } from '@/features/pdf-jobs/hooks/usePdfJob'
import { getSubmissionRecovery } from '@/features/pdf-builder/lib/files'
import { JobList } from '@/features/pdf-jobs/components/JobList'

export function WorkspacePage() {
  const mode = useWorkspaceStore((state) => state.mode)
  const setMode = useWorkspaceStore((state) => state.setMode)
  const selectedJobId = useWorkspaceStore((state) => state.selectedJobId)
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  const jobs = usePdfJobs({ status: 'all', search: '' })
  const selectedJob = usePdfJob(selectedJobId)
  const recovery = getSubmissionRecovery(selectedJob.data)

  return (
    <PageContainer data-ui-capture="authenticated-workspace" className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">创建任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">选择 Markdown，确认选项后手动开始生成</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/jobs">全部任务</Link></Button>
      </header>

      {realtimeConnection === 'disconnected' && <Alert variant="warning"><AlertDescription>实时同步暂不可用，已切换为定时刷新。</AlertDescription></Alert>}

      <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-56">
          <TabsTrigger value="single"><PlusCircle />单文件</TabsTrigger>
          <TabsTrigger value="batch"><Files />批量</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="mt-3"><SingleJobForm recovery={recovery} /></TabsContent>
        <TabsContent value="batch" className="mt-3"><BatchQueue /></TabsContent>
      </Tabs>

      <section className="flex flex-col gap-3" aria-labelledby="recent-jobs-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="recent-jobs-title" className="text-lg font-semibold">最近任务</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">仅显示最近 5 条，不展示构建流程</p>
          </div>
          <Button asChild variant="ghost" size="sm"><Link to="/jobs">查看全部</Link></Button>
        </div>
        <JobList jobs={(jobs.data || []).slice(0, 5)} loading={jobs.isLoading} />
      </section>
    </PageContainer>
  )
}

import { useMemo } from 'react'
import { Files, PlusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '@/components/layout/PageContainer'
import { SingleJobForm } from '@/features/pdf-builder/components/SingleJobForm'
import { BatchQueue } from '@/features/pdf-builder/components/BatchQueue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import { usePdfJob } from '@/features/pdf-jobs/hooks/usePdfJob'
import { getSubmissionRecovery } from '@/features/pdf-builder/lib/files'
import { JobList } from '@/features/pdf-jobs/components/JobList'
import { isTerminalJob } from '@/features/pdf-jobs/status'

export function WorkspacePage() {
  const { mode, setMode, selectedJobId, realtimeConnection } = useWorkspaceStore(
    useShallow((state) => ({
      mode: state.mode,
      setMode: state.setMode,
      selectedJobId: state.selectedJobId,
      realtimeConnection: state.realtimeConnection,
    })),
  )
  const jobs = usePdfJobs({ status: 'all', search: '' })
  const selectedJob = usePdfJob(selectedJobId)
  const recovery = getSubmissionRecovery(selectedJob.data)
  const overview = useMemo(() => {
    const items = jobs.data ?? []
    return {
      total: items.length,
      active: items.filter((job) => !isTerminalJob(job)).length,
      completed: items.filter((job) => job.status === 'completed').length,
    }
  }, [jobs.data])

  return (
    <PageContainer data-ui-capture="authenticated-workspace" className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="section-kicker">PDF 工作台</span>
            <Badge variant="secondary" className="rounded-full font-medium">手动提交</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">创建任务</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">选择 Markdown、检查文件名和构建选项，仅在点击“生成 PDF”后上传并启动任务。</p>
        </div>
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to="/jobs"><Files />全部任务</Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="任务概览">
        <div className="app-panel-muted px-4 py-3"><span className="block text-xs text-muted-foreground">全部任务</span><strong className="mt-1 block text-xl tabular-nums">{overview.total}</strong></div>
        <div className="app-panel-muted px-4 py-3"><span className="block text-xs text-muted-foreground">正在处理</span><strong className="mt-1 block text-xl tabular-nums">{overview.active}</strong></div>
        <div className="app-panel-muted px-4 py-3"><span className="block text-xs text-muted-foreground">已完成</span><strong className="mt-1 block text-xl tabular-nums">{overview.completed}</strong></div>
      </section>

      {realtimeConnection === 'disconnected' && <Alert variant="warning"><AlertDescription>实时同步暂不可用，已切换为定时刷新。</AlertDescription></Alert>}

      <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
        <TabsList className="grid w-full grid-cols-2 sm:w-64">
          <TabsTrigger value="single"><PlusCircle />单文件</TabsTrigger>
          <TabsTrigger value="batch"><Files />批量</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="mt-3"><SingleJobForm recovery={recovery} /></TabsContent>
        <TabsContent value="batch" className="mt-3"><BatchQueue /></TabsContent>
      </Tabs>

      <section className="flex flex-col gap-3" aria-labelledby="recent-jobs-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="section-kicker">最近活动</span>
            <h2 id="recent-jobs-title" className="mt-1 text-lg font-semibold">最近任务</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">仅显示最近 5 条，不展示构建流程</p>
          </div>
          <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} to="/jobs">查看全部</Link>
        </div>
        <JobList jobs={(jobs.data || []).slice(0, 5)} loading={jobs.isLoading} />
      </section>
    </PageContainer>
  )
}

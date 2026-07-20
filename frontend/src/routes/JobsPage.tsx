import { FilePlus2, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { JobList } from '@/features/pdf-jobs/components/JobList'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import type { JobFilters } from '@/features/pdf-jobs/types'

const validStatuses = new Set(['all', 'active', 'completed', 'failed', 'favorite'])
const titles: Record<NonNullable<JobFilters['status']>, string> = {
  all: '全部任务',
  active: '进行中',
  completed: '已完成',
  failed: '异常任务',
  favorite: '收藏任务',
}

export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status') || 'all'
  const filters: JobFilters = {
    status: validStatuses.has(statusParam) ? statusParam as JobFilters['status'] : 'all',
    search: params.get('q') ?? '',
  }
  const jobs = usePdfJobs(filters)
  const marker = filters.status === 'favorite' ? 'favorites-list' : 'jobs-list'

  const updateParams = (nextFilters: JobFilters) => {
    const next = new URLSearchParams(params)
    if (!nextFilters.status || nextFilters.status === 'all') next.delete('status'); else next.set('status', nextFilters.status)
    if (!nextFilters.search?.trim()) next.delete('q'); else next.set('q', nextFilters.search)
    setParams(next, { replace: true })
  }

  return (
    <PageContainer data-ui-capture={marker} className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="section-kicker">任务中心</span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{titles[filters.status || 'all']}</h1>
          <p className="mt-1 text-sm text-muted-foreground">共 {jobs.data?.length ?? 0} 条任务，可按状态和文档名筛选。</p>
        </div>
        <Link className={buttonVariants({ size: 'sm' })} to="/workspace"><FilePlus2 />创建任务</Link>
      </header>

      <section className="app-panel flex flex-col gap-2 p-2 sm:flex-row" aria-label="任务筛选">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="搜索任务" className="border-transparent bg-muted/45 pl-9 shadow-none focus-visible:bg-background" value={filters.search || ''} placeholder="搜索文档名或源文件" onChange={(event) => updateParams({ ...filters, search: event.target.value })} />
        </div>
        <Select aria-label="任务状态" className="sm:w-48" value={filters.status || 'all'} onChange={(event) => updateParams({ ...filters, status: event.target.value as JobFilters['status'] })}>
          <option value="all">全部任务</option>
          <option value="active">进行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败、取消与过期</option>
          <option value="favorite">已收藏</option>
        </Select>
      </section>

      {jobs.error && <Alert variant="destructive"><AlertDescription>{jobs.error instanceof Error ? jobs.error.message : '任务加载失败。'}</AlertDescription></Alert>}
      <JobList jobs={jobs.data || []} loading={jobs.isLoading} emptyMessage="没有符合当前条件的任务。" grouped />
    </PageContainer>
  )
}

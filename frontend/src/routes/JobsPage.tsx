import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { JobList } from '@/features/pdf-jobs/components/JobList'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import type { JobFilters } from '@/features/pdf-jobs/types'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const validStatuses = new Set(['all', 'active', 'completed', 'failed', 'favorite'])
const titles: Record<NonNullable<JobFilters['status']>, string> = {
  all: '全部任务',
  active: '进行中',
  completed: '已完成',
  failed: '失败任务',
  favorite: '收藏任务',
}

export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const storedFilters = useWorkspaceStore((state) => state.filters)
  const setFilters = useWorkspaceStore((state) => state.setFilters)
  const statusParam = params.get('status') || storedFilters.status || 'all'
  const searchParam = params.get('q')
  const filters: JobFilters = {
    status: validStatuses.has(statusParam) ? statusParam as JobFilters['status'] : 'all',
    search: searchParam ?? storedFilters.search ?? '',
  }
  const jobs = usePdfJobs(filters)
  const marker = filters.status === 'favorite' ? 'favorites-list' : 'jobs-list'

  useEffect(() => { setFilters(filters) }, [filters.search, filters.status, setFilters])

  const updateParams = (nextFilters: JobFilters) => {
    const next = new URLSearchParams(params)
    if (!nextFilters.status || nextFilters.status === 'all') next.delete('status'); else next.set('status', nextFilters.status)
    if (!nextFilters.search?.trim()) next.delete('q'); else next.set('q', nextFilters.search)
    setParams(next, { replace: true })
    setFilters(nextFilters)
  }

  return (
    <PageContainer data-ui-capture={marker} className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{titles[filters.status || 'all']}</h1>
        <span className="text-sm tabular-nums text-muted-foreground">{jobs.data?.length ?? 0} 条</span>
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="搜索任务" className="pl-9" value={filters.search || ''} placeholder="搜索文档名或源文件" onChange={(event) => updateParams({ ...filters, search: event.target.value })} />
        </div>
        <Select aria-label="任务状态" value={filters.status || 'all'} onChange={(event) => updateParams({ ...filters, status: event.target.value as JobFilters['status'] })}>
          <option value="all">全部任务</option>
          <option value="active">进行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败、取消与过期</option>
          <option value="favorite">已收藏</option>
        </Select>
      </div>

      {jobs.error && <Alert variant="destructive"><AlertDescription>{jobs.error instanceof Error ? jobs.error.message : '任务加载失败。'}</AlertDescription></Alert>}
      <JobList jobs={jobs.data || []} loading={jobs.isLoading} emptyMessage="没有符合当前条件的任务。" />
    </PageContainer>
  )
}

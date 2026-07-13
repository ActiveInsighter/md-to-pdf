import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageContainer } from '@/components/layout/PageContainer'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { JobList } from '@/features/pdf-jobs/components/JobList'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import type { JobFilters } from '@/features/pdf-jobs/types'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const validStatuses = new Set(['all', 'active', 'completed', 'failed', 'favorite'])

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

  useEffect(() => { setFilters(filters) }, [filters.search, filters.status, setFilters])

  const updateParams = (nextFilters: JobFilters) => {
    const next = new URLSearchParams(params)
    if (!nextFilters.status || nextFilters.status === 'all') next.delete('status'); else next.set('status', nextFilters.status)
    if (!nextFilters.search?.trim()) next.delete('q'); else next.set('q', nextFilters.search)
    setParams(next, { replace: true })
    setFilters(nextFilters)
  }

  return (
    <PageContainer className="flex flex-col gap-6">
      <div className="max-w-3xl"><span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">任务档案</span><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">查找每一次构建</h1><p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">按状态或名称快速定位任务，重新打开进度、下载成品或恢复未启动的上传。</p></div>

      <Card className="shadow-none">
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-[minmax(0,1fr)_220px] sm:pt-6">
          <Field>
            <FieldLabel htmlFor="job-search">搜索任务</FieldLabel>
            <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="job-search" className="pl-9" value={filters.search || ''} placeholder="文档名或源文件名" onChange={(event) => updateParams({ ...filters, search: event.target.value })} /></div>
          </Field>
          <Field>
            <FieldLabel htmlFor="job-status">任务状态</FieldLabel>
            <Select id="job-status" value={filters.status || 'all'} onChange={(event) => updateParams({ ...filters, status: event.target.value as JobFilters['status'] })}><option value="all">全部任务</option><option value="active">进行中</option><option value="completed">已完成</option><option value="failed">失败、取消与过期</option><option value="favorite">已收藏</option></Select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">任务列表</h2><span className="text-sm tabular-nums text-muted-foreground">{jobs.data?.length ?? 0} 条结果</span></div>
      {jobs.error && <Alert variant="destructive"><AlertDescription>{jobs.error instanceof Error ? jobs.error.message : '任务加载失败。'}</AlertDescription></Alert>}
      <JobList jobs={jobs.data || []} loading={jobs.isLoading} emptyMessage="没有符合当前条件的任务。" />
    </PageContainer>
  )
}

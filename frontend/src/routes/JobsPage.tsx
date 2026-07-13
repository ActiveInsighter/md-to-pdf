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

export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const storedFilters = useWorkspaceStore((state) => state.filters)
  const setFilters = useWorkspaceStore((state) => state.setFilters)
  const statusParam = params.get('status') || storedFilters.status || 'all'
  const filters: JobFilters = { status: validStatuses.has(statusParam) ? statusParam as JobFilters['status'] : 'all', search: storedFilters.search || '' }
  const jobs = usePdfJobs(filters)

  useEffect(() => { setFilters(filters) }, [filters.search, filters.status, setFilters])
  const updateStatus = (status: JobFilters['status']) => {
    const next = new URLSearchParams(params)
    if (!status || status === 'all') next.delete('status'); else next.set('status', status)
    setParams(next)
    setFilters({ ...filters, status })
  }

  return (
    <PageContainer className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">任务管理</h1><p className="mt-1 text-sm text-muted-foreground">搜索、筛选并重新打开你的 PDF 构建任务。</p></div>
      <div className="grid gap-3 rounded-lg border bg-white p-4 shadow-panel sm:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={filters.search || ''} placeholder="搜索文档名或文件名" onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></div><Select value={filters.status || 'all'} onChange={(event) => updateStatus(event.target.value as JobFilters['status'])}><option value="all">全部任务</option><option value="active">进行中</option><option value="completed">已完成</option><option value="failed">失败与过期</option><option value="favorite">已收藏</option></Select></div>
      {jobs.error && <Alert variant="destructive"><AlertDescription>{jobs.error instanceof Error ? jobs.error.message : '任务加载失败。'}</AlertDescription></Alert>}
      <JobList jobs={jobs.data || []} loading={jobs.isLoading} emptyMessage="没有符合当前筛选条件的任务。" />
    </PageContainer>
  )
}

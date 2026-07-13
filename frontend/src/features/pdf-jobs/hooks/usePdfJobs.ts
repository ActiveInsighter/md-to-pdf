import { useQuery } from '@tanstack/react-query'
import { listPdfJobs } from '../api/pdfJobs'
import { pdfJobKeys } from '../queryKeys'
import { getJobDisplayStatus, isTerminalJob } from '../status'
import type { JobFilters, PdfJob } from '../types'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function filterPdfJobs(jobs: PdfJob[], filters: JobFilters): PdfJob[] {
  const search = filters.search?.trim().toLowerCase() || ''
  return jobs.filter((job) => {
    const displayStatus = getJobDisplayStatus(job)
    const statusMatches = !filters.status || filters.status === 'all'
      || (filters.status === 'active' && !isTerminalJob(job))
      || (filters.status === 'completed' && displayStatus === 'completed')
      || (filters.status === 'failed' && ['failed', 'expired', 'cancelled'].includes(displayStatus))
      || (filters.status === 'favorite' && job.is_favorite)
    const searchMatches = !search || `${job.document_name} ${job.source_filename} ${job.output_filename || ''}`.toLowerCase().includes(search)
    return statusMatches && searchMatches
  })
}

export function usePdfJobs(filters: JobFilters = { status: 'all', search: '' }) {
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  return useQuery({
    queryKey: pdfJobKeys.list(filters),
    queryFn: listPdfJobs,
    select: (jobs) => filterPdfJobs(jobs, filters),
    refetchInterval: (query) => {
      const jobs = query.state.data
      if (!jobs?.some((job) => !isTerminalJob(job))) return false
      return realtimeConnection === 'connected' ? 30_000 : 5_000
    },
  })
}

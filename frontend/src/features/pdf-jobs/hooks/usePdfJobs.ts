import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { listPdfJobs } from '../api/pdfJobs'
import { pdfJobKeys } from '../queryKeys'
import { getJobDisplayStatus, isTerminalJob } from '../status'
import type { JobFilters, PdfJob } from '../types'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getPdfJobPollInterval } from '@/utils/realtimePolling'
import {
  getPdfJobListRevision,
  markPdfJobListSnapshot,
  reconcilePdfJobHistory,
} from './cache'

const DEFAULT_JOB_FILTERS: JobFilters = { status: 'all', search: '' }

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

export function usePdfJobs(filters: JobFilters = DEFAULT_JOB_FILTERS) {
  const { session } = useAuth()
  const userId = session?.user.id
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  const selectJobs = useCallback(
    (jobs: PdfJob[]) => filterPdfJobs(jobs, filters),
    [filters.search, filters.status],
  )

  return useQuery<PdfJob[], Error, PdfJob[]>({
    queryKey: pdfJobKeys.list(userId || 'anonymous'),
    queryFn: async () => {
      if (!userId) return []
      const revision = getPdfJobListRevision(userId)
      const jobs = await listPdfJobs()
      return markPdfJobListSnapshot(jobs, userId, revision)
    },
    enabled: Boolean(userId),
    structuralSharing: (oldData, newData) => reconcilePdfJobHistory(
      oldData as PdfJob[] | undefined,
      newData as PdfJob[],
    ),
    select: selectJobs,
    refetchInterval: (query) => {
      const jobs = query.state.data
      if (!jobs?.some((job) => !isTerminalJob(job))) return false
      return getPdfJobPollInterval(realtimeConnection)
    },
  })
}

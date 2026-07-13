import { useQuery } from '@tanstack/react-query'
import { getPdfJob } from '../api/pdfJobs'
import { pdfJobKeys } from '../queryKeys'
import { isTerminalJob } from '../status'
import type { PdfJob } from '../types'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { shouldApplyPdfJobUpdate } from './cache'

export function usePdfJob(jobId: string | null | undefined) {
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  return useQuery({
    queryKey: pdfJobKeys.detail(jobId || 'none'),
    queryFn: () => getPdfJob(jobId!),
    enabled: Boolean(jobId),
    structuralSharing: (oldData: PdfJob | undefined, newData: PdfJob) =>
      shouldApplyPdfJobUpdate(oldData, newData) ? newData : oldData || newData,
    refetchInterval: (query) => {
      const job = query.state.data
      if (!job || isTerminalJob(job)) return false
      return realtimeConnection === 'connected' ? 30_000 : 4_000
    },
  })
}

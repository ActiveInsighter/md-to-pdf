import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { getPdfJob } from '../api/pdfJobs'
import { pdfJobKeys } from '../queryKeys'
import { isTerminalJob } from '../status'
import type { PdfJob } from '../types'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getPdfJobPollInterval } from '@/utils/realtimePolling'
import { shouldApplyPdfJobUpdate } from './cache'

export function usePdfJob(jobId: string | null | undefined) {
  const { session } = useAuth()
  const userId = session?.user.id
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  return useQuery<PdfJob>({
    queryKey: pdfJobKeys.detail(userId || 'anonymous', jobId || 'none'),
    queryFn: () => getPdfJob(jobId!),
    enabled: Boolean(userId && jobId),
    structuralSharing: (oldData, newData) => {
      const current = oldData as PdfJob | undefined
      const incoming = newData as PdfJob
      return shouldApplyPdfJobUpdate(current, incoming) ? incoming : current || incoming
    },
    refetchInterval: (query) => {
      const job = query.state.data
      if (!job || isTerminalJob(job)) return false
      return getPdfJobPollInterval(realtimeConnection)
    },
  })
}

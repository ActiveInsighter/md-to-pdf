import { useQuery } from '@tanstack/react-query'
import { getPdfJob } from '../api/pdfJobs'
import { pdfJobKeys } from '../queryKeys'
import { isTerminalJob } from '../status'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function usePdfJob(jobId: string | null | undefined) {
  const realtimeConnection = useWorkspaceStore((state) => state.realtimeConnection)
  return useQuery({
    queryKey: pdfJobKeys.detail(jobId || 'none'),
    queryFn: () => getPdfJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const job = query.state.data
      if (!job || isTerminalJob(job)) return false
      return realtimeConnection === 'connected' ? 30_000 : 4_000
    },
  })
}

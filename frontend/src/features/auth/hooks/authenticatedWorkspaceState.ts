import type { QueryClient } from '@tanstack/react-query'
import { pdfJobKeys } from '../../pdf-jobs/queryKeys'
import { useWorkspaceStore } from '../../../stores/workspaceStore'

export async function clearAuthenticatedWorkspaceState(queryClient: QueryClient): Promise<void> {
  const workspace = useWorkspaceStore.getState()
  workspace.setSelectedJobId(null)
  workspace.setFilters({ ...workspace.filters, search: '' })

  try {
    await queryClient.cancelQueries({ queryKey: pdfJobKeys.all })
  } catch {
    // Cache removal must still happen if a custom query function rejects cancellation.
  } finally {
    queryClient.removeQueries({ queryKey: pdfJobKeys.all })
  }
}

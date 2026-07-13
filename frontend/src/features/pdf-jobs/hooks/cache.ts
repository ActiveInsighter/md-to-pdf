import type { QueryClient } from '@tanstack/react-query'
import { pdfJobKeys } from '../queryKeys'
import type { PdfJob, PdfJobStatus } from '../types'

const STATUS_ORDER: Record<PdfJobStatus, number> = {
  created: 0,
  uploaded: 1,
  queued: 2,
  building: 3,
  uploading: 4,
  completed: 5,
  failed: 5,
  expired: 5,
}

const TERMINAL_STATUSES = new Set<PdfJobStatus>(['completed', 'failed', 'expired'])

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function shouldApplyPdfJobUpdate(
  current: PdfJob | null | undefined,
  incoming: PdfJob,
): boolean {
  if (!current) return true
  if (current.id !== incoming.id) return false

  const currentTime = timestamp(current.updated_at)
  const incomingTime = timestamp(incoming.updated_at)

  if (currentTime !== null && incomingTime !== null) {
    if (incomingTime > currentTime) return true
    if (incomingTime < currentTime) return false
  } else if (incomingTime !== null) {
    return true
  } else if (currentTime !== null) {
    return false
  }

  if (TERMINAL_STATUSES.has(current.status)) {
    return incoming.status === current.status
  }

  return STATUS_ORDER[incoming.status] >= STATUS_ORDER[current.status]
}

export function mergePdfJobHistory(
  current: PdfJob[] | null | undefined,
  incoming: PdfJob[],
  limit = Number.POSITIVE_INFINITY,
): PdfJob[] {
  if (limit <= 0) return []

  const merged = new Map((current || []).map((job) => [job.id, job]))
  for (const job of incoming) {
    const existing = merged.get(job.id)
    if (shouldApplyPdfJobUpdate(existing, job)) merged.set(job.id, job)
  }

  return [...merged.values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit)
}

export function mergeJobIntoCache(queryClient: QueryClient, job: PdfJob): void {
  queryClient.setQueryData<PdfJob>(pdfJobKeys.detail(job.id), (current) =>
    shouldApplyPdfJobUpdate(current, job) ? job : current,
  )
  queryClient.setQueriesData<PdfJob[]>({ queryKey: pdfJobKeys.lists() }, (current) =>
    current ? mergePdfJobHistory(current, [job]) : current,
  )
}

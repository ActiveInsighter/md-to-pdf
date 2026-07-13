import type { QueryClient } from '@tanstack/react-query'
import { pdfJobKeys } from '../queryKeys'
import { PDF_JOB_TERMINAL_STATUSES, type PdfJob, type PdfJobStatus } from '../types'

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

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isTerminal(status: PdfJobStatus): boolean {
  return (PDF_JOB_TERMINAL_STATUSES as readonly PdfJobStatus[]).includes(status)
}

export function shouldApplyPdfJobUpdate(
  current: PdfJob | null | undefined,
  incoming: PdfJob,
): boolean {
  if (!current) return true
  if (current.id !== incoming.id) return false

  if (isTerminal(current.status) && incoming.status !== current.status) return false

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

  if (isTerminal(current.status)) return incoming.status === current.status
  return STATUS_ORDER[incoming.status] >= STATUS_ORDER[current.status]
}

export function mergePdfJobHistory(
  current: PdfJob[] | null | undefined,
  incoming: PdfJob[],
  limit = 200,
): PdfJob[] {
  if (limit <= 0) return []

  const merged = new Map((current || []).map((job) => [job.id, job]))
  for (const job of incoming) {
    const existing = merged.get(job.id)
    if (shouldApplyPdfJobUpdate(existing, job)) merged.set(job.id, job)
  }

  return [...merged.values()]
    .sort((left, right) => {
      const leftTime = timestamp(left.created_at) ?? 0
      const rightTime = timestamp(right.created_at) ?? 0
      return rightTime - leftTime || right.id.localeCompare(left.id)
    })
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

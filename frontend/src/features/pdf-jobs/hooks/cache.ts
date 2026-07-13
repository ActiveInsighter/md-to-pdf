import type { QueryClient } from '@tanstack/react-query'
import { pdfJobKeys } from '../queryKeys'
import { PDF_JOB_TERMINAL_STATUSES, type PdfJob, type PdfJobStatus } from '../types'

type PdfJobCacheChange = {
  revision: number
  kind: 'upsert' | 'delete'
}

type PdfJobListSnapshot = {
  userId: string
  revision: number
}

const listRevisions = new Map<string, number>()
const listChanges = new Map<string, Map<string, PdfJobCacheChange>>()
const listSnapshots = new WeakMap<PdfJob[], PdfJobListSnapshot>()

const STATUS_ORDER: Record<PdfJobStatus, number> = {
  created: 0,
  uploaded: 1,
  queued: 2,
  building: 3,
  uploading: 4,
  completed: 5,
  failed: 5,
  cancelled: 5,
  expired: 5,
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isTerminal(status: PdfJobStatus): boolean {
  return (PDF_JOB_TERMINAL_STATUSES as readonly PdfJobStatus[]).includes(status)
}

function isAllowedTerminalTransition(current: PdfJobStatus, incoming: PdfJobStatus): boolean {
  return current === incoming || (current !== 'expired' && incoming === 'expired')
}

function recordPdfJobCacheChange(userId: string, jobId: string, kind: PdfJobCacheChange['kind']): void {
  const revision = (listRevisions.get(userId) || 0) + 1
  listRevisions.set(userId, revision)
  const changes = listChanges.get(userId) || new Map<string, PdfJobCacheChange>()
  changes.set(jobId, { revision, kind })
  listChanges.set(userId, changes)
}

function sortAndLimitPdfJobs(jobs: Iterable<PdfJob>, limit: number): PdfJob[] {
  return [...jobs]
    .sort((left, right) => {
      const leftTime = timestamp(left.created_at) ?? 0
      const rightTime = timestamp(right.created_at) ?? 0
      return rightTime - leftTime || right.id.localeCompare(left.id)
    })
    .slice(0, limit)
}

export function getPdfJobListRevision(userId: string): number {
  return listRevisions.get(userId) || 0
}

export function markPdfJobListSnapshot(
  jobs: PdfJob[],
  userId: string,
  revision: number,
): PdfJob[] {
  listSnapshots.set(jobs, { userId, revision })
  return jobs
}

export function shouldApplyPdfJobUpdate(
  current: PdfJob | null | undefined,
  incoming: PdfJob,
): boolean {
  if (!current) return true
  if (current.id !== incoming.id || current.user_id !== incoming.user_id) return false

  if (isTerminal(current.status) && !isAllowedTerminalTransition(current.status, incoming.status)) {
    return false
  }

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

  if (isTerminal(current.status)) {
    return isAllowedTerminalTransition(current.status, incoming.status)
  }
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

  return sortAndLimitPdfJobs(merged.values(), limit)
}

/**
 * Treat a completed list request as authoritative while preserving cache
 * changes that arrived after that request began. Delete tombstones prevent a
 * stale response from resurrecting a task removed by Realtime.
 */
export function reconcilePdfJobHistory(
  current: PdfJob[] | null | undefined,
  incoming: PdfJob[],
  limit = 200,
): PdfJob[] {
  if (limit <= 0) return []

  const snapshot = listSnapshots.get(incoming)
  const changes = snapshot ? listChanges.get(snapshot.userId) : undefined
  const currentById = new Map((current || []).map((job) => [job.id, job]))
  const incomingIds = new Set(incoming.map((job) => job.id))
  const reconciled = new Map<string, PdfJob>()

  for (const job of incoming) {
    const change = changes?.get(job.id)
    if (snapshot && change && change.revision > snapshot.revision && change.kind === 'delete') {
      continue
    }

    const existing = currentById.get(job.id)
    reconciled.set(job.id, shouldApplyPdfJobUpdate(existing, job) ? job : existing || job)
  }

  if (snapshot) {
    for (const job of current || []) {
      if (incomingIds.has(job.id)) continue
      const change = changes?.get(job.id)
      if (change && change.revision > snapshot.revision && change.kind === 'upsert') {
        reconciled.set(job.id, job)
      }
    }

    if (changes) {
      for (const [jobId, change] of changes) {
        if (change.revision <= snapshot.revision) changes.delete(jobId)
      }
      if (changes.size === 0) listChanges.delete(snapshot.userId)
    }
  }

  return sortAndLimitPdfJobs(reconciled.values(), limit)
}

export function mergeJobIntoCache(queryClient: QueryClient, job: PdfJob): void {
  recordPdfJobCacheChange(job.user_id, job.id, 'upsert')
  queryClient.setQueryData<PdfJob>(pdfJobKeys.detail(job.user_id, job.id), (current) =>
    shouldApplyPdfJobUpdate(current, job) ? job : current,
  )
  queryClient.setQueryData<PdfJob[]>(pdfJobKeys.list(job.user_id), (current) =>
    current ? mergePdfJobHistory(current, [job]) : [job],
  )
}

export function removeJobFromCache(queryClient: QueryClient, userId: string, jobId: string): void {
  recordPdfJobCacheChange(userId, jobId, 'delete')
  queryClient.removeQueries({ queryKey: pdfJobKeys.detail(userId, jobId), exact: true })
  queryClient.setQueryData<PdfJob[]>(pdfJobKeys.list(userId), (current) =>
    current?.filter((job) => job.id !== jobId),
  )
}

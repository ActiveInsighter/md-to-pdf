import type { PdfJob, PdfJobStatus } from '../types/pdfJob'

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

function createdAt(job: PdfJob): number {
  return timestamp(job.created_at) ?? 0
}

export function shouldApplyPdfJobUpdate(current: PdfJob | null, next: PdfJob): boolean {
  if (!current) return true
  if (current.id !== next.id) return false

  const currentTerminal = TERMINAL_STATUSES.has(current.status)
  const nextTerminal = TERMINAL_STATUSES.has(next.status)

  // Terminal outcomes are sticky. Follow-up writes for the same terminal state
  // (for example path cleanup) are still accepted when their timestamp advances.
  if (currentTerminal && current.status !== next.status) return false

  const currentTime = timestamp(current.updated_at)
  const nextTime = timestamp(next.updated_at)

  if (currentTime !== null && nextTime !== null && currentTime !== nextTime) {
    return nextTime > currentTime
  }
  if (currentTime === null && nextTime !== null) return true
  if (currentTime !== null && nextTime === null) return false

  if (current.status === next.status) return true
  if (nextTerminal && !currentTerminal) return true
  return STATUS_ORDER[next.status] >= STATUS_ORDER[current.status]
}

export function mergePdfJobHistory(
  current: PdfJob[],
  incoming: PdfJob[],
  limit = 20,
): PdfJob[] {
  const currentById = new Map(current.map((job) => [job.id, job]))
  const merged = new Map<string, PdfJob>()

  for (const next of incoming) {
    const existing = currentById.get(next.id) ?? null
    merged.set(next.id, shouldApplyPdfJobUpdate(existing, next) ? next : existing!)
  }

  // Keep snapshots that appeared after an older list request started. Sorting and
  // limiting below still enforce the same most-recent-first history window.
  for (const existing of current) {
    if (!merged.has(existing.id)) merged.set(existing.id, existing)
  }

  return [...merged.values()]
    .sort((left, right) => createdAt(right) - createdAt(left) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit))
}

export const CANCELLED_ERROR_MESSAGE = '用户已取消未启动任务。'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CANCELLABLE_STATUSES = new Set(['created', 'uploaded'])

export type PdfJobRow = {
  id: string
  user_id: string
  status: string
  input_path: string | null
  assets_path: string | null
  error_message: string | null
}

export type CancellationDecision =
  | { kind: 'not-found' }
  | { kind: 'conflict'; status: string }
  | { kind: 'idempotent'; job: PdfJobRow }
  | { kind: 'cancel'; job: PdfJobRow }

export type CleanupDependencies = {
  removeObjects: (paths: string[]) => Promise<string | null>
  clearPaths: (jobId: string) => Promise<string | null>
}

export type CleanupResult = {
  cleanupPending: boolean
  storageError: string | null
  clearPathsError: string | null
}

export function isValidJobId(jobId: string): boolean {
  return UUID_RE.test(jobId)
}

export function decideCancellation(
  userId: string,
  current: PdfJobRow | null,
): CancellationDecision {
  if (!current || current.user_id !== userId) return { kind: 'not-found' }

  if (current.status === 'failed' && current.error_message === CANCELLED_ERROR_MESSAGE) {
    return { kind: 'idempotent', job: current }
  }

  if (!CANCELLABLE_STATUSES.has(current.status)) {
    return { kind: 'conflict', status: current.status }
  }

  return { kind: 'cancel', job: current }
}

export function resolveCancellationRace(
  userId: string,
  latest: PdfJobRow | null,
): Exclude<CancellationDecision, { kind: 'cancel' }> {
  const decision = decideCancellation(userId, latest)
  if (decision.kind !== 'cancel') return decision
  return { kind: 'conflict', status: latest?.status || 'unknown' }
}

export function pendingObjectPaths(job: PdfJobRow): string[] {
  return [job.input_path, job.assets_path].filter((path): path is string => Boolean(path))
}

export async function cleanupCancelledJob(
  job: PdfJobRow,
  dependencies: CleanupDependencies,
): Promise<CleanupResult> {
  const paths = pendingObjectPaths(job)
  if (paths.length === 0) {
    return { cleanupPending: false, storageError: null, clearPathsError: null }
  }

  const storageError = await dependencies.removeObjects(paths)
  if (storageError) {
    return { cleanupPending: true, storageError, clearPathsError: null }
  }

  const clearPathsError = await dependencies.clearPaths(job.id)
  return {
    cleanupPending: Boolean(clearPathsError),
    storageError: null,
    clearPathsError,
  }
}

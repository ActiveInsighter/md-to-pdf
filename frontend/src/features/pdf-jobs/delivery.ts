import type { PdfJob, PdfJobStatus } from './types'

export type JobDeliverySnapshot = Pick<PdfJob, 'id' | 'status'>

const ACTIVE_DELIVERY_STATUSES = new Set<PdfJobStatus>([
  'created',
  'uploaded',
  'queued',
  'building',
  'uploading',
])

/**
 * Auto delivery is an edge-triggered action. A completed task loaded from
 * history must never be treated as a new completion event.
 */
export function shouldDeliverJobCompletion(
  previous: JobDeliverySnapshot | null | undefined,
  current: JobDeliverySnapshot,
): boolean {
  return Boolean(
    previous
      && previous.id === current.id
      && ACTIVE_DELIVERY_STATUSES.has(previous.status)
      && current.status === 'completed',
  )
}

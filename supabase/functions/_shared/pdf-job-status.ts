export const PDF_JOB_STATUSES = [
  'created',
  'uploaded',
  'queued',
  'building',
  'uploading',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const

export type PdfJobStatus = (typeof PDF_JOB_STATUSES)[number]

export const PDF_JOB_PENDING_INPUT_STATUSES = [
  'created',
  'uploaded',
] as const satisfies readonly PdfJobStatus[]

export const PDF_JOB_ACTIVE_STATUSES = [
  'queued',
  'building',
  'uploading',
] as const satisfies readonly PdfJobStatus[]

export const PDF_JOB_TERMINAL_STATUSES = [
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const satisfies readonly PdfJobStatus[]

export const PDF_JOB_START_IDEMPOTENT_STATUSES = [
  ...PDF_JOB_ACTIVE_STATUSES,
  'completed',
] as const satisfies readonly PdfJobStatus[]

export const PDF_JOB_START_FAILURE_STATUSES = [
  'uploaded',
  'queued',
] as const satisfies readonly PdfJobStatus[]

const allStatuses = new Set<string>(PDF_JOB_STATUSES)
const pendingInputStatuses = new Set<string>(PDF_JOB_PENDING_INPUT_STATUSES)
const startIdempotentStatuses = new Set<string>(PDF_JOB_START_IDEMPOTENT_STATUSES)

export function isPdfJobStatus(value: unknown): value is PdfJobStatus {
  return typeof value === 'string' && allStatuses.has(value)
}

export function isPendingInputPdfJobStatus(
  value: unknown,
): value is (typeof PDF_JOB_PENDING_INPUT_STATUSES)[number] {
  return typeof value === 'string' && pendingInputStatuses.has(value)
}

export function isStartIdempotentPdfJobStatus(
  value: unknown,
): value is (typeof PDF_JOB_START_IDEMPOTENT_STATUSES)[number] {
  return typeof value === 'string' && startIdempotentStatuses.has(value)
}

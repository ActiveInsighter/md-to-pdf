import type { CreatePdfJobResponse, PdfJob, PdfJobStatus } from '../types/pdfJob'
import type { SubmissionRecovery } from '../types/upload'

export const PDF_JOB_PENDING_INPUT_STATUSES = [
  'created',
  'uploaded',
] as const satisfies readonly PdfJobStatus[]

export type PendingInputPdfJobStatus = (typeof PDF_JOB_PENDING_INPUT_STATUSES)[number]

const pendingInputStatuses = new Set<PdfJobStatus>(PDF_JOB_PENDING_INPUT_STATUSES)

export function isPendingInputPdfJobStatus(
  status: PdfJobStatus,
): status is PendingInputPdfJobStatus {
  return pendingInputStatuses.has(status)
}

export function createSubmissionRecovery(
  created: CreatePdfJobResponse,
  hasAssets: boolean,
): SubmissionRecovery {
  return {
    jobId: created.jobId,
    status: 'created',
    inputPath: created.inputPath,
    assetsPath: created.assetsPath,
    hasAssets,
    sourceFilename: created.sourceFilename,
    documentName: created.documentName,
  }
}

export function getSubmissionRecovery(job: PdfJob): SubmissionRecovery | null {
  if (!isPendingInputPdfJobStatus(job.status)) return null
  if (!job.input_path) return null
  if (job.has_assets && !job.assets_path) return null

  return {
    jobId: job.id,
    status: job.status,
    inputPath: job.input_path,
    assetsPath: job.assets_path,
    hasAssets: job.has_assets,
    sourceFilename: job.source_filename,
    documentName: job.document_name,
  }
}

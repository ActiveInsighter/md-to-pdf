import type { PdfJob, PdfJobStatus } from '../types/pdfJob'

export const PDF_JOB_STATUS_LABELS: Record<PdfJobStatus, string> = {
  created: '准备上传',
  uploaded: '上传完成',
  queued: '等待构建',
  building: '正在构建',
  uploading: '正在上传 PDF',
  completed: '已完成',
  failed: '构建失败',
  expired: '已过期',
}

export const PDF_JOB_TERMINAL_STATUSES = [
  'completed',
  'failed',
  'expired',
] as const satisfies readonly PdfJobStatus[]

export type TerminalPdfJobStatus = (typeof PDF_JOB_TERMINAL_STATUSES)[number]

const terminalPdfJobStatuses = new Set<PdfJobStatus>(PDF_JOB_TERMINAL_STATUSES)

export function isTerminalPdfJobStatus(status: PdfJobStatus): status is TerminalPdfJobStatus {
  return terminalPdfJobStatuses.has(status)
}

export function getTerminalPdfJobRefreshKey(
  job: Pick<PdfJob, 'id' | 'status'>,
): string | null {
  return isTerminalPdfJobStatus(job.status) ? `${job.id}:${job.status}` : null
}

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

export const PDF_JOB_STAGE_LABELS: Record<string, string> = {
  created: '等待选择并上传文件',
  'input-ready': '输入文件已安全保存',
  queued: '已进入 GitHub Actions 队列',
  'runner-started': '构建环境已经启动',
  'fetching-input': '正在读取 Markdown 与资源包',
  'preparing-source': '正在校验并准备构建目录',
  rendering: 'Chromium 正在渲染 PDF',
  'validating-output': '正在检查 PDF 完整性',
  'uploading-output': '正在上传生成结果',
  completed: 'PDF 已生成，可以下载',
  failed: '构建已停止，请查看错误信息',
  expired: '任务产物已过期',
}

const FALLBACK_PROGRESS: Record<PdfJobStatus, number> = {
  created: 0,
  uploaded: 15,
  queued: 25,
  building: 60,
  uploading: 90,
  completed: 100,
  failed: 0,
  expired: 100,
}

export const PDF_JOB_TERMINAL_STATUSES = [
  'completed',
  'failed',
  'expired',
] as const satisfies readonly PdfJobStatus[]

const terminalPdfJobStatuses = new Set<PdfJobStatus>(PDF_JOB_TERMINAL_STATUSES)

export function isTerminalPdfJobStatus(status: PdfJobStatus): boolean {
  return terminalPdfJobStatuses.has(status)
}

export function getPdfJobProgress(job: PdfJob): number {
  const progress = Number(job.progress_percent)
  if (Number.isFinite(progress)) return Math.min(100, Math.max(0, Math.round(progress)))
  return FALLBACK_PROGRESS[job.status]
}

export function getPdfJobStageLabel(job: PdfJob): string {
  const stage = job.progress_stage?.trim()
  if (stage && PDF_JOB_STAGE_LABELS[stage]) return PDF_JOB_STAGE_LABELS[stage]
  return PDF_JOB_STATUS_LABELS[job.status]
}

export function getTerminalPdfJobRefreshKey(
  job: Pick<PdfJob, 'id' | 'status'>,
): string | null {
  return isTerminalPdfJobStatus(job.status) ? `${job.id}:${job.status}` : null
}

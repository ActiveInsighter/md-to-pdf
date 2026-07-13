import type { CreatePdfJobResponse, PdfJob } from '@/features/pdf-jobs/types'
import type { MarkdownSource, SubmissionRecovery } from '../types'

export const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024
export const MAX_ASSETS_BYTES = 50 * 1024 * 1024
export const MAX_BATCH_FILES = 20

export function documentNameFromMarkdown(filename: string): string {
  return filename.replace(/\.md$/i, '').trim() || 'document'
}

export function markdownFilename(name: string): string {
  const normalized = name.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ')
  return `${normalized || 'document'}.md`
}

export function pdfFilenameFromMarkdown(filename: string): string {
  return `${documentNameFromMarkdown(filename)}.pdf`
}

export function validateMarkdownFile(file: File): string | null {
  if (file.size <= 0) return 'Markdown 文件不能为空。'
  if (file.size > MAX_MARKDOWN_BYTES) return 'Markdown 文件不能超过 10 MiB。'
  if (!file.name.toLowerCase().endsWith('.md')) return '请选择扩展名为 .md 的 Markdown 文件。'
  return null
}

export function validateAssetsFile(file: File): string | null {
  if (file.size <= 0) return '资源压缩包不能为空。'
  if (file.size > MAX_ASSETS_BYTES) return '资源压缩包不能超过 50 MiB。'
  if (!file.name.toLowerCase().endsWith('.zip')) return '请选择扩展名为 .zip 的资源压缩包。'
  return null
}

export function markdownSourceToFile(source: MarkdownSource, documentName: string): File {
  const filename = markdownFilename(documentName)
  if (source.kind === 'file') {
    return source.file.name === filename
      ? source.file
      : new File([source.file], filename, { type: 'text/markdown', lastModified: source.file.lastModified })
  }
  return new File([source.text], filename, { type: 'text/markdown' })
}

export function createSubmissionRecovery(created: CreatePdfJobResponse, hasAssets: boolean): SubmissionRecovery {
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

export function getSubmissionRecovery(job: PdfJob | null | undefined): SubmissionRecovery | null {
  if (!job || (job.status !== 'created' && job.status !== 'uploaded') || !job.input_path) return null
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

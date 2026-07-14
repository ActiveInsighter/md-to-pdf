import type { CreatePdfJobResponse, PdfJob } from '@/features/pdf-jobs/types'
import type { MarkdownSource, SubmissionRecovery } from '../types'

export const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024
export const MAX_ASSETS_BYTES = 50 * 1024 * 1024
export const MAX_BATCH_FILES = 20
const MAX_DOCUMENT_NAME_LENGTH = 120

function cleanDocumentNameCandidate(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/^\s{0,3}>+\s*/, '')
    .replace(/^\s*[-+*]\s+/, '')
    .replace(/\s+#+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DOCUMENT_NAME_LENGTH)
}

export function documentNameFromMarkdown(filename: string): string {
  return cleanDocumentNameCandidate(filename.replace(/\.md$/i, '')) || 'document'
}

export function inferMarkdownDocumentName(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/)
  let fence: '`' | '~' | null = null
  let bestLevel = 7
  let bestTitle = ''
  let firstContent = ''

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const fenceToken = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1] ?? ''
    if (fenceToken) {
      const marker = fenceToken[0] as '`' | '~'
      fence = fence === marker ? null : fence || marker
      continue
    }
    if (fence) continue

    if (!firstContent) {
      const candidate = cleanDocumentNameCandidate(line)
      if (candidate && candidate !== '---') firstContent = candidate
    }

    const atx = line.match(/^\s{0,3}(#{1,6})[\t ]+(.+?)\s*$/)
    const atxMarkers = atx?.[1] ?? ''
    const atxTitle = atx?.[2] ?? ''
    if (atxMarkers && atxTitle) {
      const title = cleanDocumentNameCandidate(atxTitle)
      const level = atxMarkers.length
      if (title && level < bestLevel) {
        bestLevel = level
        bestTitle = title
        if (level === 1) return title
      }
      continue
    }

    const next = lines[index + 1] ?? ''
    const setextMarker = next.match(/^\s{0,3}(=+|-+)\s*$/)?.[1] ?? ''
    const title = cleanDocumentNameCandidate(line)
    if (title && setextMarker) {
      const level = setextMarker[0] === '=' ? 1 : 2
      if (level < bestLevel) {
        bestLevel = level
        bestTitle = title
        if (level === 1) return title
      }
      index += 1
    }
  }

  return bestTitle || firstContent || '粘贴的 Markdown'
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

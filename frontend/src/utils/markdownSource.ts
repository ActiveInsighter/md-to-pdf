import type { MarkdownSource } from '../types/upload'
import { documentNameFromMarkdown } from './documentName'

const DEFAULT_DOCUMENT_NAME = '未命名文档'
const MAX_INFERRED_NAME_LENGTH = 80

function cleanNameCandidate(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s+#+\s*$/, '')
    .replace(/[`*_~[\]<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_INFERRED_NAME_LENGTH)
}

export function inferMarkdownDocumentName(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const levelOneHeading = lines.find((line) => /^#\s+\S/.test(line.trim()))
  const firstContentLine = lines.find((line) => line.trim().length > 0)
  const candidate = cleanNameCandidate(levelOneHeading || firstContentLine || '')
  return candidate || DEFAULT_DOCUMENT_NAME
}

export function markdownFilenameFromDocumentName(documentName: string): string {
  const normalized = documentNameFromMarkdown(documentName || DEFAULT_DOCUMENT_NAME)
  return `${normalized}.md`
}

export function markdownSourceToFile(source: MarkdownSource): File {
  if (source.kind === 'file') return source.file

  return new File([source.text], source.filename, {
    type: 'text/markdown;charset=utf-8',
    lastModified: Date.now(),
  })
}

export function markdownTextByteLength(markdown: string): number {
  return new TextEncoder().encode(markdown).byteLength
}

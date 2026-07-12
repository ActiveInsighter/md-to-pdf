const WINDOWS_INVALID_RE = /[<>:"/\\|?*\u0000-\u001f]/g
const TRAILING_DOTS_AND_SPACES_RE = /[. ]+$/g
const RESERVED_WINDOWS_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MARKDOWN_EXTENSION_RE = /\.md$/i
const MAX_DOCUMENT_NAME_LENGTH = 160

function truncateUnicode(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('')
}

export type NormalizedDocumentName = {
  documentName: string
  sourceFilename: string
  outputFilename: string
}

export function normalizeDocumentName(value: unknown): NormalizedDocumentName | null {
  const raw = String(value || '').normalize('NFC').trim()
  if (!MARKDOWN_EXTENSION_RE.test(raw)) return null

  let documentName = raw
    .replace(MARKDOWN_EXTENSION_RE, '')
    .replace(WINDOWS_INVALID_RE, '-')
    .replace(/\s+/g, ' ')
    .replace(TRAILING_DOTS_AND_SPACES_RE, '')
    .trim()

  if (!documentName) documentName = 'document'
  documentName = truncateUnicode(documentName, MAX_DOCUMENT_NAME_LENGTH)
    .replace(TRAILING_DOTS_AND_SPACES_RE, '')
    .trim()

  if (!documentName) documentName = 'document'
  if (RESERVED_WINDOWS_NAME_RE.test(documentName)) documentName = `_${documentName}`

  return {
    documentName,
    sourceFilename: `${documentName}.md`,
    outputFilename: `${documentName}.pdf`,
  }
}

export function outputFilenameFromDocumentName(value: unknown): string {
  const normalized = normalizeDocumentName(`${String(value || '').replace(MARKDOWN_EXTENSION_RE, '')}.md`)
  return normalized?.outputFilename || 'document.pdf'
}

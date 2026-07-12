const MARKDOWN_EXTENSION_RE = /\.md$/i
const WINDOWS_INVALID_RE = /[<>:"/\\|?*\u0000-\u001f]/g
const TRAILING_DOTS_AND_SPACES_RE = /[. ]+$/g

export function documentNameFromMarkdown(fileName: string): string {
  const cleaned = fileName
    .normalize('NFC')
    .replace(MARKDOWN_EXTENSION_RE, '')
    .replace(WINDOWS_INVALID_RE, '-')
    .replace(/\s+/g, ' ')
    .replace(TRAILING_DOTS_AND_SPACES_RE, '')
    .trim()
  return cleaned || 'document'
}

export function pdfFilenameFromMarkdown(fileName: string): string {
  return `${documentNameFromMarkdown(fileName)}.pdf`
}

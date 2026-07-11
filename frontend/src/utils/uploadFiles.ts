export const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024
export const MAX_ASSETS_BYTES = 50 * 1024 * 1024

function hasExtension(file: File, extension: string): boolean {
  return file.name.toLowerCase().endsWith(extension)
}

export function validateMarkdownFile(file: File): string | null {
  if (file.size <= 0) return 'Markdown 文件不能为空。'
  if (file.size > MAX_MARKDOWN_BYTES) return 'Markdown 文件不能超过 10 MiB。'
  if (!hasExtension(file, '.md')) return '请选择扩展名为 .md 的 Markdown 文件。'
  return null
}

export function validateAssetsFile(file: File): string | null {
  if (file.size <= 0) return '资源压缩包不能为空。'
  if (file.size > MAX_ASSETS_BYTES) return '资源压缩包不能超过 50 MiB。'
  if (!hasExtension(file, '.zip')) return '请选择扩展名为 .zip 的资源压缩包。'
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

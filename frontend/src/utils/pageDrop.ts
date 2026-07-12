import { validateAssetsFile, validateMarkdownFile } from './uploadFiles'

export type PageDropSelection = {
  markdown: File | null
  assets: File | null
  error: string
}

export function classifyPageDrop(files: readonly File[]): PageDropSelection {
  let markdown: File | null = null
  let assets: File | null = null
  const unsupported: string[] = []

  for (const file of files) {
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.md')) {
      if (markdown) return { markdown: null, assets: null, error: '一次只能拖入一个 Markdown 文件。' }
      const validationError = validateMarkdownFile(file)
      if (validationError) return { markdown: null, assets: null, error: validationError }
      markdown = file
      continue
    }

    if (lowerName.endsWith('.zip')) {
      if (assets) return { markdown: null, assets: null, error: '一次只能拖入一个资源 ZIP。' }
      const validationError = validateAssetsFile(file)
      if (validationError) return { markdown: null, assets: null, error: validationError }
      assets = file
      continue
    }

    unsupported.push(file.name)
  }

  if (unsupported.length > 0) {
    return {
      markdown: null,
      assets: null,
      error: `不支持以下文件：${unsupported.join('、')}。只接受 .md 和 .zip。`,
    }
  }

  if (!markdown && !assets) {
    return { markdown: null, assets: null, error: '请拖入 Markdown 文件或资源 ZIP。' }
  }

  return { markdown, assets, error: '' }
}

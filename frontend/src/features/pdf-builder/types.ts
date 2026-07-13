export const PDF_THEMES = [
  { id: 'chatgpt-light', name: '简洁浅色', description: '纯白背景，适合通用文档与打印。' },
  { id: 'academic', name: '学术论文', description: '更紧凑的正文、标题与表格排版。' },
  { id: 'github', name: 'GitHub', description: '接近 GitHub Markdown 的阅读风格。' },
] as const

export type PdfThemeId = (typeof PDF_THEMES)[number]['id']
export type WorkspaceMode = 'single' | 'batch'

export type MarkdownSource =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string; filename: string }

export type SubmissionRecovery = {
  jobId: string
  status: 'created' | 'uploaded'
  inputPath: string
  assetsPath: string | null
  hasAssets: boolean
  sourceFilename?: string
  documentName?: string
}

export const PDF_THEMES = [
  {
    id: 'chatgpt-light',
    name: '简洁浅色',
    description: '纯白背景，适合通用文档与打印。',
  },
  {
    id: 'academic',
    name: '学术论文',
    description: '更紧凑的正文、标题与表格排版。',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: '接近 GitHub Markdown 的阅读风格。',
  },
] as const

export type PdfThemeId = (typeof PDF_THEMES)[number]['id']

const STORAGE_KEY = 'md-to-pdf-theme'
const THEME_IDS = new Set<string>(PDF_THEMES.map((theme) => theme.id))

export function isPdfThemeId(value: string): value is PdfThemeId {
  return THEME_IDS.has(value)
}

export function getPdfTheme(): PdfThemeId {
  if (typeof window === 'undefined') return 'chatgpt-light'
  const stored = window.localStorage.getItem(STORAGE_KEY) || ''
  return isPdfThemeId(stored) ? stored : 'chatgpt-light'
}

export function setPdfTheme(theme: PdfThemeId): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, theme)
}

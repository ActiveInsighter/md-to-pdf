import { z } from 'zod'
import { PDF_THEMES } from '../types'

const themeIds = PDF_THEMES.map((theme) => theme.id) as [string, ...string[]]

export const builderSchema = z.object({
  documentName: z.string().trim().min(1, '请选择 Markdown 或粘贴文本以生成文件名。').max(120, '文件名不能超过 120 个字符。'),
  sourceMode: z.enum(['file', 'text']),
  markdownText: z.string().max(10 * 1024 * 1024, 'Markdown 文本不能超过 10 MiB。'),
  theme: z.enum(themeIds),
}).superRefine((value, context) => {
  if (value.sourceMode === 'text' && !value.markdownText.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['markdownText'], message: '请输入或粘贴 Markdown 文本。' })
  }
})

export type BuilderFormValues = z.infer<typeof builderSchema>

import { z } from 'zod'
import { PDF_THEMES } from '../types'

const themeIds = PDF_THEMES.map((theme) => theme.id) as [string, ...string[]]
export const settingsSchema = z.object({
  theme: z.enum(themeIds),
  autoDownload: z.boolean(),
  notifyOnComplete: z.boolean(),
})
export type SettingsFormValues = z.infer<typeof settingsSchema>

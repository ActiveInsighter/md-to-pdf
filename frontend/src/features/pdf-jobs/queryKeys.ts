import type { JobFilters } from './types'

export const pdfJobKeys = {
  all: ['pdf-jobs'] as const,
  lists: () => [...pdfJobKeys.all, 'list'] as const,
  list: (filters: JobFilters) => [...pdfJobKeys.lists(), filters] as const,
  details: () => [...pdfJobKeys.all, 'detail'] as const,
  detail: (id: string) => [...pdfJobKeys.details(), id] as const,
}

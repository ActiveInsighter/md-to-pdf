export const pdfJobKeys = {
  all: ['pdf-jobs'] as const,
  lists: () => [...pdfJobKeys.all, 'list'] as const,
  list: (userId: string) => [...pdfJobKeys.lists(), userId] as const,
  details: () => [...pdfJobKeys.all, 'detail'] as const,
  detail: (userId: string, id: string) => [...pdfJobKeys.details(), userId, id] as const,
}

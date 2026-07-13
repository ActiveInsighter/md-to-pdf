import type { QueryClient } from '@tanstack/react-query'
import { pdfJobKeys } from '../queryKeys'
import type { PdfJob } from '../types'

export function mergeJobIntoCache(queryClient: QueryClient, job: PdfJob): void {
  queryClient.setQueryData(pdfJobKeys.detail(job.id), job)
  queryClient.setQueriesData<PdfJob[]>({ queryKey: pdfJobKeys.lists() }, (current) => {
    if (!current) return current
    const next = current.some((item) => item.id === job.id)
      ? current.map((item) => item.id === job.id ? job : item)
      : [job, ...current]
    return next.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  })
}

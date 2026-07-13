import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  cancelPdfJob,
  createPdfJob,
  getPdfDownload,
  getPdfJob,
  rebuildPdfJob,
  setPdfJobFavorite,
  startPdfJob,
  uploadAssets,
  uploadInput,
} from '../api/pdfJobs'
import { pdfJobKeys } from '../queryKeys'
import type { PdfJob } from '../types'
import type { PdfThemeId } from '@/features/pdf-builder/types'
import { toUserMessage } from '@/lib/errors'
import { mergeJobIntoCache } from './cache'

export function usePdfJobActions() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id

  const create = useMutation({ mutationFn: (input: { hasAssets: boolean; sourceFilename: string; theme: PdfThemeId }) => createPdfJob(input.hasAssets, input.sourceFilename, input.theme) })
  const uploadMarkdown = useMutation({ mutationFn: (input: { path: string; file: File }) => uploadInput(input.path, input.file) })
  const uploadResources = useMutation({ mutationFn: (input: { path: string; file: File }) => uploadAssets(input.path, input.file) })
  const start = useMutation({
    mutationFn: startPdfJob,
    onSuccess: async (_, jobId) => {
      const job = await getPdfJob(jobId)
      mergeJobIntoCache(queryClient, job)
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.list(job.user_id) })
    },
  })
  const cancel = useMutation({
    mutationFn: cancelPdfJob,
    onSuccess: async (_, jobId) => {
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: pdfJobKeys.detail(userId, jobId) })
        await queryClient.invalidateQueries({ queryKey: pdfJobKeys.list(userId) })
      }
      toast.success('任务已取消。')
    },
    onError: (error) => toast.error(toUserMessage(error)),
  })
  const rebuild = useMutation({
    mutationFn: rebuildPdfJob,
    onSuccess: async (result) => {
      if (userId) await queryClient.invalidateQueries({ queryKey: pdfJobKeys.list(userId) })
      toast.success('已创建新的构建任务。')
      return result
    },
    onError: (error) => toast.error(toUserMessage(error)),
  })
  const favorite = useMutation({
    mutationFn: ({ jobId, isFavorite }: { jobId: string; isFavorite: boolean }) => setPdfJobFavorite(jobId, isFavorite),
    onMutate: async ({ jobId, isFavorite }) => {
      if (!userId) return { previous: undefined }
      const detailKey = pdfJobKeys.detail(userId, jobId)
      const listKey = pdfJobKeys.list(userId)
      await queryClient.cancelQueries({ queryKey: listKey })
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData<PdfJob>(detailKey)
      queryClient.setQueryData<PdfJob>(detailKey, (job) => job ? { ...job, is_favorite: isFavorite } : job)
      queryClient.setQueryData<PdfJob[]>(listKey, (jobs) => jobs?.map((job) => job.id === jobId ? { ...job, is_favorite: isFavorite } : job))
      return { previous }
    },
    onError: (error, input, context) => {
      if (context?.previous) mergeJobIntoCache(queryClient, context.previous)
      toast.error(toUserMessage(error))
    },
    onSettled: async (_, __, input) => {
      if (!userId) return
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.detail(userId, input.jobId) })
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.list(userId) })
    },
  })
  const download = useMutation({ mutationFn: getPdfDownload, onError: (error) => toast.error(toUserMessage(error, '下载地址生成失败。')) })

  return { create, uploadMarkdown, uploadResources, start, cancel, rebuild, favorite, download }
}

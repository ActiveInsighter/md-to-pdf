import { STORAGE_BUCKET, supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import type { CreatePdfJobResponse, PdfDownload, PdfDownloadKind, PdfJob } from '../types'
import type { PdfThemeId } from '@/features/pdf-builder/types'
import { documentNameFromMarkdown, pdfFilenameFromMarkdown } from '@/features/pdf-builder/lib/files'

type CancelPdfJobResponse = {
  jobId: string
  status: 'failed' | 'cancelled'
  cancelled: true
  idempotent: boolean
  cleanupPending: boolean
}

type CreatePdfJobWireResponse = Partial<CreatePdfJobResponse> & {
  jobId?: string
  inputPath?: string
  assetsPath?: string | null
  sourceName?: string
  expiresAt?: string
}

type ConfirmPdfUploadResponse = {
  jobId: string
  status: 'uploaded'
  uploaded_at?: string
  progress_percent?: number
  progress_stage?: string
  idempotent: boolean
}

type RebuildPdfJobResponse = {
  jobId: string
  status: PdfJob['status']
  sourceJobId: string
  theme: PdfThemeId
  sourceFilename?: string
}
type FavoritePdfJobResponse = { jobId: string; isFavorite: boolean; expiresAt: string }
type DownloadWireResponse = {
  downloadUrl?: string
  fileName?: string
  outputFilename?: string
  sourceFilename?: string
  kind?: PdfDownloadKind
}

export async function createPdfJob(hasAssets: boolean, sourceFilename: string, theme: PdfThemeId): Promise<CreatePdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<CreatePdfJobWireResponse>('create-pdf-job', {
    body: {
      theme,
      options: { breaks: true, toc: true },
      hasAssets,
      sourceFilename,
      sourceName: sourceFilename,
    },
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId || !data.inputPath || !data.status || !data.expiresAt) {
    throw new Error('创建任务返回的数据不完整。')
  }
  const normalizedSourceFilename = data.sourceFilename || data.sourceName || sourceFilename
  return {
    jobId: data.jobId,
    status: data.status,
    inputPath: data.inputPath,
    assetsPath: data.assetsPath ?? null,
    sourceFilename: normalizedSourceFilename,
    documentName: data.documentName || documentNameFromMarkdown(normalizedSourceFilename),
    outputFilename: data.outputFilename || pdfFilenameFromMarkdown(normalizedSourceFilename),
    theme: data.theme || theme,
    options: data.options || { breaks: true, toc: true },
    expiresAt: data.expiresAt,
  }
}

export async function uploadInput(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: 'text/markdown; charset=utf-8',
    upsert: true,
  })
  if (error) throw new Error(`Markdown 上传失败：${error.message}`)
}

export async function uploadAssets(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: 'application/zip',
    upsert: true,
  })
  if (error) throw new Error(`资源压缩包上传失败：${error.message}`)
}

export async function confirmPdfUpload(jobId: string): Promise<ConfirmPdfUploadResponse> {
  const { data, error } = await supabase.functions.invoke<ConfirmPdfUploadResponse>('confirm-pdf-upload', {
    body: { jobId },
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId || data.jobId !== jobId || data.status !== 'uploaded') {
    throw new Error('源文件上传确认返回的数据不完整。')
  }
  return data
}

export async function startPdfJob(jobId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('start-pdf-job', { body: { jobId } })
  if (error) throw new Error(error.message)
}

export async function cancelPdfJob(jobId: string): Promise<CancelPdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<CancelPdfJobResponse>('cancel-pdf-job', { body: { jobId } })
  if (error) throw new Error(error.message)
  if (!data?.cancelled || data.jobId !== jobId) throw new Error('取消任务返回的数据不完整。')
  return data
}

export async function rebuildPdfJob(input: { jobId: string; theme: PdfThemeId }): Promise<RebuildPdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<RebuildPdfJobResponse>('rebuild-pdf-job', {
    body: input,
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId || data.sourceJobId !== input.jobId || data.theme !== input.theme) {
    throw new Error('重新构建返回的数据不完整。')
  }
  await startPdfJob(data.jobId)
  return { ...data, status: 'queued' }
}

export async function setPdfJobFavorite(jobId: string, isFavorite: boolean): Promise<FavoritePdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<FavoritePdfJobResponse>('favorite-pdf-job', {
    body: { jobId, isFavorite },
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId || data.jobId !== jobId) throw new Error('收藏状态更新失败。')
  return data
}

export async function getPdfJob(jobId: string): Promise<PdfJob> {
  const { data, error } = await supabase.from('pdf_jobs').select('*').eq('id', jobId).single()
  if (error) throw new Error(error.message)
  return data as PdfJob
}

export async function listPdfJobs(): Promise<PdfJob[]> {
  const { data, error } = await supabase.from('pdf_jobs').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return (data || []) as PdfJob[]
}

async function getJobDownload(jobId: string, kind: PdfDownloadKind): Promise<PdfDownload> {
  const { data, error } = await supabase.functions.invoke<DownloadWireResponse>('get-pdf-download', {
    body: { jobId, kind },
  })
  if (error) throw new Error(error.message)
  const fileName = data?.fileName || (kind === 'source' ? data?.sourceFilename : data?.outputFilename)
  if (!data?.downloadUrl || !fileName) throw new Error('下载地址生成失败。')
  return { downloadUrl: data.downloadUrl, fileName, kind }
}

export function getPdfDownload(jobId: string): Promise<PdfDownload> {
  return getJobDownload(jobId, 'pdf')
}

export function getSourceDownload(jobId: string): Promise<PdfDownload> {
  return getJobDownload(jobId, 'source')
}

export function readablePdfError(error: unknown): string {
  return toUserMessage(error, 'PDF 任务操作失败，请稍后重试。')
}

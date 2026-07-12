import { STORAGE_BUCKET, supabase } from '../lib/supabase'
import type { CreatePdfJobResponse, PdfDownload, PdfJob } from '../types/pdfJob'
import { documentNameFromMarkdown, pdfFilenameFromMarkdown } from '../utils/documentName'
import { getPdfTheme, type PdfThemeId } from '../utils/pdfThemes'

type CancelPdfJobResponse = {
  jobId: string
  status: 'failed'
  cancelled: true
  idempotent: boolean
  cleanupPending: boolean
}

type CreatePdfJobWireResponse = Partial<CreatePdfJobResponse> & {
  jobId?: string
  status?: CreatePdfJobResponse['status']
  inputPath?: string
  assetsPath?: string | null
  sourceName?: string
  outputFilename?: string
  expiresAt?: string
}

type RebuildPdfJobResponse = {
  jobId: string
  status: PdfJob['status']
  sourceJobId: string
}

type FavoritePdfJobResponse = {
  jobId: string
  isFavorite: boolean
  expiresAt: string
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function createPdfJob(
  hasAssets: boolean,
  sourceFilename: string,
  theme: PdfThemeId = getPdfTheme(),
): Promise<CreatePdfJobResponse> {
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
  const normalizedDocumentName = data.documentName || documentNameFromMarkdown(normalizedSourceFilename)
  const normalizedOutputFilename = data.outputFilename || pdfFilenameFromMarkdown(normalizedSourceFilename)

  return {
    jobId: data.jobId,
    status: data.status,
    inputPath: data.inputPath,
    assetsPath: data.assetsPath ?? null,
    sourceFilename: normalizedSourceFilename,
    documentName: normalizedDocumentName,
    outputFilename: normalizedOutputFilename,
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

export async function startPdfJob(jobId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('start-pdf-job', { body: { jobId } })
  if (error) throw new Error(error.message)
}

export async function rebuildPdfJob(jobId: string): Promise<RebuildPdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<RebuildPdfJobResponse>('rebuild-pdf-job', {
    body: { jobId },
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId || data.sourceJobId !== jobId) throw new Error('重复构建返回的数据不完整。')
  return data
}

export async function setPdfJobFavorite(jobId: string, isFavorite: boolean): Promise<FavoritePdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<FavoritePdfJobResponse>('favorite-pdf-job', {
    body: { jobId, isFavorite },
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId || data.jobId !== jobId) throw new Error('收藏状态更新失败。')
  return data
}

export async function cancelPdfJob(jobId: string): Promise<CancelPdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<CancelPdfJobResponse>('cancel-pdf-job', {
    body: { jobId },
  })
  if (error) throw new Error(error.message)
  if (!data?.cancelled || data.jobId !== jobId) throw new Error('取消任务返回的数据不完整。')
  return data
}

export async function getPdfJob(jobId: string): Promise<PdfJob> {
  const { data, error } = await supabase.from('pdf_jobs').select('*').eq('id', jobId).single()
  if (error) throw new Error(error.message)
  return data as PdfJob
}

export async function listPdfJobs(): Promise<PdfJob[]> {
  const { data, error } = await supabase
    .from('pdf_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data || []) as PdfJob[]
}

export async function getPdfDownload(jobId: string): Promise<PdfDownload> {
  const { data, error } = await supabase.functions.invoke<{
    downloadUrl?: string
    fileName?: string
    outputFilename?: string
  }>('get-pdf-download', {
    body: { jobId },
  })
  if (error) throw new Error(error.message)
  const fileName = data?.fileName || data?.outputFilename
  if (!data?.downloadUrl || !fileName) throw new Error('下载地址生成失败。')
  return { downloadUrl: data.downloadUrl, fileName }
}

export async function getDownloadUrl(jobId: string): Promise<string> {
  return (await getPdfDownload(jobId)).downloadUrl
}

export function readableError(error: unknown): string {
  return message(error) || '操作失败。'
}

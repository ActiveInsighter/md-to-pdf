import { STORAGE_BUCKET, supabase } from '../lib/supabase'
import type { CreatePdfJobResponse, PdfJob } from '../types/pdfJob'

type CancelPdfJobResponse = {
  jobId: string
  status: 'failed'
  cancelled: true
  idempotent: boolean
  cleanupPending: boolean
}

type PdfDownloadResponse = {
  jobId: string
  filename: string
  downloadUrl: string
  expiresIn: number
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function createPdfJob(hasAssets: boolean, sourceName: string): Promise<CreatePdfJobResponse> {
  const { data, error } = await supabase.functions.invoke<CreatePdfJobResponse>('create-pdf-job', {
    body: { theme: 'chatgpt-light', options: { breaks: true, toc: true }, hasAssets, sourceName },
  })
  if (error) throw new Error(error.message)
  if (!data?.jobId) throw new Error('创建任务返回的数据不完整。')
  return data
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
    .limit(20)
  if (error) throw new Error(error.message)
  return (data || []) as PdfJob[]
}

export async function getDownloadInfo(jobId: string): Promise<PdfDownloadResponse> {
  const { data, error } = await supabase.functions.invoke<PdfDownloadResponse>('get-pdf-download', {
    body: { jobId },
  })
  if (error) throw new Error(error.message)
  if (!data?.downloadUrl || !data.filename) throw new Error('下载地址生成失败。')
  return data
}

export function readableError(error: unknown): string {
  return message(error) || '操作失败。'
}

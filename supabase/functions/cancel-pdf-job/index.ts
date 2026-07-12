import { handleOptions, json } from '../_shared/cors.ts'
import { PDF_JOB_PENDING_INPUT_STATUSES } from '../_shared/pdf-job-status.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'
import {
  CANCELLED_ERROR_MESSAGE,
  cleanupCancelledJob,
  decideCancellation,
  isValidJobId,
  resolveCancellationRace,
  type PdfJobRow,
} from './logic.ts'

type CancelBody = { jobId?: string }

async function removePendingObjects(
  admin: ReturnType<typeof createAdminClient>,
  job: PdfJobRow,
): Promise<boolean> {
  const result = await cleanupCancelledJob(job, {
    async removeObjects(paths) {
      const { error } = await admin.storage.from(storageBucket()).remove(paths)
      return error?.message || null
    },
    async clearPaths(jobId) {
      const { error } = await admin
        .from('pdf_jobs')
        .update({
          input_path: null,
          assets_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('status', 'failed')
        .eq('error_message', CANCELLED_ERROR_MESSAGE)
      return error?.message || null
    },
  })

  if (result.storageError) {
    console.error('cancel-pdf-job storage cleanup failed', JSON.stringify({
      jobId: job.id,
      message: result.storageError,
    }))
  }

  if (result.clearPathsError) {
    console.error('cancel-pdf-job path cleanup failed', JSON.stringify({
      jobId: job.id,
      message: result.clearPathsError,
    }))
  }

  return result.cleanupPending
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as CancelBody
    const jobId = String(body.jobId || '').trim()
    if (!isValidJobId(jobId)) return json(req, { error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: current, error: currentError } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,input_path,assets_path,error_message')
      .eq('id', jobId)
      .maybeSingle()

    if (currentError) throw currentError

    const decision = decideCancellation(user.id, current as PdfJobRow | null)
    if (decision.kind === 'not-found') {
      return json(req, { error: '任务不存在或无权访问。' }, 404)
    }
    if (decision.kind === 'conflict') {
      return json(req, { error: '任务已经启动，不能再取消。', status: decision.status }, 409)
    }

    let cancelled = decision.job
    let idempotent = decision.kind === 'idempotent'

    if (decision.kind === 'cancel') {
      const now = new Date().toISOString()
      const { data, error } = await admin
        .from('pdf_jobs')
        .update({
          status: 'failed',
          error_message: CANCELLED_ERROR_MESSAGE,
          progress_message: '任务已取消',
          failed_at: now,
          completed_at: now,
          status_changed_at: now,
          progress_updated_at: now,
          updated_at: now,
        })
        .eq('id', jobId)
        .eq('user_id', user.id)
        .in('status', [...PDF_JOB_PENDING_INPUT_STATUSES])
        .select('id,user_id,status,input_path,assets_path,error_message')
        .maybeSingle()

      if (error) throw error
      if (!data) {
        const { data: latest, error: latestError } = await admin
          .from('pdf_jobs')
          .select('id,user_id,status,input_path,assets_path,error_message')
          .eq('id', jobId)
          .maybeSingle()

        if (latestError) throw latestError

        const raceDecision = resolveCancellationRace(user.id, latest as PdfJobRow | null)
        if (raceDecision.kind === 'not-found') {
          return json(req, { error: '任务不存在或无权访问。' }, 404)
        }
        if (raceDecision.kind === 'conflict') {
          return json(req, { error: '任务状态已经变化，不能再取消。', status: raceDecision.status }, 409)
        }

        cancelled = raceDecision.job
        idempotent = true
      } else {
        cancelled = data as PdfJobRow
      }
    }

    const cleanupPending = await removePendingObjects(admin, cancelled)
    return json(req, {
      jobId,
      status: 'failed',
      cancelled: true,
      idempotent,
      cleanupPending,
    })
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('cancel-pdf-job failed', message)
    return json(req, { error: '取消 PDF 任务失败。' }, 500)
  }
})

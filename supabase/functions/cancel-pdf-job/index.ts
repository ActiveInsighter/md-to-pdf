import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type CancelBody = { jobId?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CANCELLABLE_STATUSES = new Set(['created', 'uploaded'])
const CANCELLED_ERROR_MESSAGE = '用户已取消未启动任务。'

type PdfJobRow = {
  id: string
  user_id: string
  status: string
  input_path: string | null
  assets_path: string | null
  error_message: string | null
}

async function removePendingObjects(
  admin: ReturnType<typeof createAdminClient>,
  job: PdfJobRow,
): Promise<boolean> {
  const paths = [job.input_path, job.assets_path].filter((path): path is string => Boolean(path))
  if (paths.length === 0) return false

  const { error } = await admin.storage.from(storageBucket()).remove(paths)
  if (error) {
    console.error('cancel-pdf-job storage cleanup failed', JSON.stringify({
      jobId: job.id,
      message: error.message,
    }))
    return true
  }

  const { error: clearPathsError } = await admin
    .from('pdf_jobs')
    .update({
      input_path: null,
      assets_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'failed')
    .eq('error_message', CANCELLED_ERROR_MESSAGE)

  if (clearPathsError) {
    console.error('cancel-pdf-job path cleanup failed', JSON.stringify({
      jobId: job.id,
      message: clearPathsError.message,
    }))
  }

  return false
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json({ error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as CancelBody
    const jobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(jobId)) return json({ error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: current, error: currentError } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,input_path,assets_path,error_message')
      .eq('id', jobId)
      .maybeSingle()

    if (currentError) throw currentError
    if (!current || current.user_id !== user.id) {
      return json({ error: '任务不存在或无权访问。' }, 404)
    }

    let cancelled = current as PdfJobRow
    let idempotent = current.status === 'failed' && current.error_message === CANCELLED_ERROR_MESSAGE

    if (!idempotent) {
      if (!CANCELLABLE_STATUSES.has(current.status)) {
        return json({ error: '任务已经启动，不能再取消。', status: current.status }, 409)
      }

      const now = new Date().toISOString()
      const { data, error } = await admin
        .from('pdf_jobs')
        .update({
          status: 'failed',
          error_message: CANCELLED_ERROR_MESSAGE,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', jobId)
        .eq('user_id', user.id)
        .in('status', ['created', 'uploaded'])
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
        if (!latest || latest.user_id !== user.id) {
          return json({ error: '任务不存在或无权访问。' }, 404)
        }
        if (latest.status !== 'failed' || latest.error_message !== CANCELLED_ERROR_MESSAGE) {
          return json({ error: '任务状态已经变化，不能再取消。', status: latest.status }, 409)
        }

        cancelled = latest as PdfJobRow
        idempotent = true
      } else {
        cancelled = data as PdfJobRow
      }
    }

    const cleanupPending = await removePendingObjects(admin, cancelled)
    return json({
      jobId,
      status: 'failed',
      cancelled: true,
      idempotent,
      cleanupPending,
    })
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json({ error: '请先登录。' }, 401)
    console.error('cancel-pdf-job failed', message)
    return json({ error: '取消 PDF 任务失败。' }, 500)
  }
})

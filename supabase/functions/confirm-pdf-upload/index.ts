import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type ConfirmUploadBody = { jobId?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024
const MAX_ASSETS_BYTES = 50 * 1024 * 1024

async function verifyUploadedObjects(
  admin: ReturnType<typeof createAdminClient>,
  job: { id: string; has_assets: boolean },
) {
  const { data, error } = await admin.storage.from(storageBucket()).list(`jobs/${job.id}`, { limit: 100 })
  if (error) throw error

  const markdown = data.find((item) => item.name === 'input.md')
  const markdownSize = Number(markdown?.metadata?.size || 0)
  if (!markdown || markdownSize <= 0) throw new Error('MARKDOWN_MISSING')
  if (markdownSize > MAX_MARKDOWN_BYTES) throw new Error('MARKDOWN_TOO_LARGE')

  if (job.has_assets) {
    const assets = data.find((item) => item.name === 'assets.zip')
    const assetsSize = Number(assets?.metadata?.size || 0)
    if (!assets || assetsSize <= 0) throw new Error('ASSETS_MISSING')
    if (assetsSize > MAX_ASSETS_BYTES) throw new Error('ASSETS_TOO_LARGE')
  }
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as ConfirmUploadBody
    const jobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(jobId)) return json(req, { error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: job, error: jobError } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,has_assets')
      .eq('id', jobId)
      .maybeSingle()
    if (jobError) throw jobError
    if (!job || job.user_id !== user.id) return json(req, { error: '任务不存在或无权访问。' }, 404)
    if (job.status === 'uploaded') {
      return json(req, { jobId, status: 'uploaded', idempotent: true })
    }
    if (job.status !== 'created') {
      return json(req, { error: '当前任务不能确认上传。', status: job.status }, 409)
    }

    await verifyUploadedObjects(admin, job)
    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin
      .from('pdf_jobs')
      .update({
        status: 'uploaded',
        progress_percent: 25,
        progress_stage: 'uploaded',
        uploaded_at: now,
        updated_at: now,
      })
      .eq('id', jobId)
      .eq('user_id', user.id)
      .eq('status', 'created')
      .select('id,status,uploaded_at,progress_percent,progress_stage')
      .maybeSingle()
    if (updateError) throw updateError

    if (!updated) {
      const { data: latest, error: latestError } = await admin
        .from('pdf_jobs')
        .select('status,uploaded_at,progress_percent,progress_stage')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single()
      if (latestError) throw latestError
      if (latest.status !== 'uploaded') return json(req, { error: '上传状态已经发生变化。', status: latest.status }, 409)
      return json(req, { jobId, ...latest, idempotent: true })
    }

    return json(req, { jobId, ...updated, idempotent: false })
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    if (message === 'MARKDOWN_MISSING') return json(req, { error: 'Markdown 尚未上传或文件为空。' }, 400)
    if (message === 'MARKDOWN_TOO_LARGE') return json(req, { error: 'Markdown 超过 10 MiB 限制。' }, 413)
    if (message === 'ASSETS_MISSING') return json(req, { error: '资源压缩包尚未上传或文件为空。' }, 400)
    if (message === 'ASSETS_TOO_LARGE') return json(req, { error: '资源压缩包超过 50 MiB 限制。' }, 413)
    console.error('confirm-pdf-upload failed', message)
    return json(req, { error: '确认源文件上传失败。' }, 500)
  }
})

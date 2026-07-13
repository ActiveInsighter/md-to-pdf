import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage } from '../_shared/supabase.ts'

type FavoriteBody = {
  jobId?: string
  isFavorite?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as FavoriteBody
    const jobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(jobId)) return json(req, { error: '任务 ID 格式错误。' }, 400)
    if (typeof body.isFavorite !== 'boolean') return json(req, { error: '收藏状态必须是布尔值。' }, 400)

    const admin = createAdminClient()
    const { data: job, error: jobError } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,expires_at,is_favorite')
      .eq('id', jobId)
      .maybeSingle()
    if (jobError) throw jobError
    if (!job || job.user_id !== user.id) return json(req, { error: '任务不存在或无权访问。' }, 404)
    if (job.status === 'expired') return json(req, { error: '已过期任务的文件已经删除，无法收藏。' }, 409)

    const expiresAt = body.isFavorite
      ? job.expires_at
      : new Date(Date.now() + RETENTION_MS).toISOString()
    const { data, error } = await admin
      .from('pdf_jobs')
      .update({
        is_favorite: body.isFavorite,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('user_id', user.id)
      .neq('status', 'expired')
      .select('id,is_favorite,expires_at')
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return json(req, { error: '任务已进入过期清理，无法更新收藏状态。' }, 409)
    }

    return json(req, {
      jobId: data.id,
      isFavorite: data.is_favorite,
      expiresAt: data.expires_at,
    })
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('favorite-pdf-job failed', message)
    return json(req, { error: '更新收藏状态失败。' }, 500)
  }
})

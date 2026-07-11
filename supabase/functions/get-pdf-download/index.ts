import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type DownloadBody = { jobId?: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPIRES_IN = 3600

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json({ error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as DownloadBody
    const jobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(jobId)) return json({ error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: job, error } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,output_path')
      .eq('id', jobId)
      .maybeSingle()
    if (error) throw error
    if (!job || job.user_id !== user.id) return json({ error: '任务不存在或无权访问。' }, 404)
    if (job.status !== 'completed' || !job.output_path) return json({ error: 'PDF 尚未生成完成。' }, 409)

    const { data, error: signedError } = await admin.storage
      .from(storageBucket())
      .createSignedUrl(job.output_path, EXPIRES_IN, { download: `pdf-${jobId}.pdf` })
    if (signedError || !data?.signedUrl) throw signedError || new Error('SIGNED_URL_FAILED')

    return json({ jobId, downloadUrl: data.signedUrl, expiresIn: EXPIRES_IN })
  } catch (error) {
    if (safeErrorMessage(error) === 'UNAUTHORIZED') return json({ error: '请先登录。' }, 401)
    console.error('get-pdf-download failed')
    return json({ error: '生成 PDF 下载地址失败。' }, 500)
  }
})

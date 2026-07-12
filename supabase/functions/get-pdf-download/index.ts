import { handleOptions, json } from '../_shared/cors.ts'
import { normalizeDocumentName, outputFilenameFromDocumentName } from '../_shared/document-name.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type DownloadBody = { jobId?: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPIRES_IN = 3600

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as DownloadBody
    const jobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(jobId)) return json(req, { error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: job, error } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,output_path,document_name,source_filename,source_name,output_filename')
      .eq('id', jobId)
      .maybeSingle()
    if (error) throw error
    if (!job || job.user_id !== user.id) return json(req, { error: '任务不存在或无权访问。' }, 404)
    if (job.status !== 'completed' || !job.output_path) return json(req, { error: 'PDF 尚未生成完成。' }, 409)

    const normalized = normalizeDocumentName(
      job.source_filename || job.source_name || `${job.document_name || 'document'}.md`,
    )
    const fileName = normalized?.outputFilename
      || outputFilenameFromDocumentName(job.document_name)
      || job.output_filename
      || 'document.pdf'

    const { data, error: signedError } = await admin.storage
      .from(storageBucket())
      .createSignedUrl(job.output_path, EXPIRES_IN, { download: fileName })
    if (signedError || !data?.signedUrl) throw signedError || new Error('SIGNED_URL_FAILED')

    return json(req, {
      jobId,
      downloadUrl: data.signedUrl,
      fileName,
      outputFilename: fileName,
      expiresIn: EXPIRES_IN,
    })
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('get-pdf-download failed', message)
    return json(req, { error: '生成 PDF 下载地址失败。' }, 500)
  }
})

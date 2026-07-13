import { handleOptions, json } from '../_shared/cors.ts'
import { normalizeDocumentName, outputFilenameFromDocumentName } from '../_shared/document-name.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type DownloadKind = 'pdf' | 'source'
type DownloadBody = { jobId?: string; kind?: DownloadKind }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPIRES_IN = 3600

async function objectExists(
  bucket: ReturnType<ReturnType<typeof createAdminClient>['storage']['from']>,
  objectPath: string,
): Promise<boolean> {
  const parts = objectPath.split('/')
  const fileName = parts.pop()
  const folder = parts.join('/')
  if (!fileName || !folder) return false

  const { data, error } = await bucket.list(folder, { limit: 20, search: fileName })
  if (error) throw error
  return data.some((item) => item.name === fileName && Number(item.metadata?.size || 0) > 0)
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as DownloadBody
    const jobId = String(body.jobId || '').trim()
    const kind: DownloadKind = body.kind === 'source' ? 'source' : 'pdf'
    if (!UUID_RE.test(jobId)) return json(req, { error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: job, error } = await admin
      .from('pdf_jobs')
      .select('id,user_id,status,input_path,output_path,document_name,source_filename,source_name,output_filename')
      .eq('id', jobId)
      .maybeSingle()
    if (error) throw error
    if (!job || job.user_id !== user.id) return json(req, { error: '任务不存在或无权访问。' }, 404)

    const normalized = normalizeDocumentName(
      job.source_filename || job.source_name || `${job.document_name || 'document'}.md`,
    )

    let objectPath: string | null = null
    let fileName = 'document.pdf'
    if (kind === 'source') {
      if (job.status === 'expired' || job.status === 'cancelled' || !job.input_path) {
        return json(req, { error: 'Markdown 源文件已不可用。' }, 409)
      }
      objectPath = job.input_path
      fileName = normalized?.sourceFilename || 'document.md'
    } else {
      if (job.status !== 'completed' || !job.output_path) {
        return json(req, { error: 'PDF 尚未生成完成。' }, 409)
      }
      objectPath = job.output_path
      fileName = normalized?.outputFilename
        || outputFilenameFromDocumentName(job.document_name)
        || job.output_filename
        || 'document.pdf'
    }

    const bucket = admin.storage.from(storageBucket())
    if (!(await objectExists(bucket, objectPath))) {
      return json(req, { error: kind === 'source' ? 'Markdown 源文件不存在。' : 'PDF 文件不存在。' }, 409)
    }

    const { data, error: signedError } = await bucket.createSignedUrl(
      objectPath,
      EXPIRES_IN,
      { download: fileName },
    )
    if (signedError || !data?.signedUrl) throw signedError || new Error('SIGNED_URL_FAILED')

    return json(req, {
      jobId,
      kind,
      downloadUrl: data.signedUrl,
      fileName,
      outputFilename: kind === 'pdf' ? fileName : undefined,
      sourceFilename: kind === 'source' ? fileName : undefined,
      expiresIn: EXPIRES_IN,
    })
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('get-pdf-download failed', message)
    return json(req, { error: '生成文件下载地址失败。' }, 500)
  }
})

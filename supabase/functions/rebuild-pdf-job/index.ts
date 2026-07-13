import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type RebuildBody = { jobId?: string; theme?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_THEMES = new Set(['chatgpt-light', 'academic', 'github'])
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  let newJobId = ''
  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as RebuildBody
    const sourceJobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(sourceJobId)) return json(req, { error: '任务 ID 格式错误。' }, 400)

    const admin = createAdminClient()
    const { data: source, error: sourceError } = await admin
      .from('pdf_jobs')
      .select('*')
      .eq('id', sourceJobId)
      .maybeSingle()
    if (sourceError) throw sourceError
    if (!source || source.user_id !== user.id) return json(req, { error: '任务不存在或无权访问。' }, 404)
    if (source.status !== 'completed' && source.status !== 'failed') {
      return json(req, { error: '只有已完成或失败的任务可以使用保留源稿重新构建。' }, 409)
    }
    if (!source.input_path) return json(req, { error: 'Markdown 源文件已经不可用。' }, 409)

    const theme = String(body.theme || source.theme || 'chatgpt-light').trim()
    if (!ALLOWED_THEMES.has(theme)) return json(req, { error: '不支持的 PDF 主题。' }, 400)

    const bucket = admin.storage.from(storageBucket())
    const { data: sourceObjects, error: listError } = await bucket.list(`jobs/${sourceJobId}`, { limit: 100 })
    if (listError) throw listError
    if (!sourceObjects.some((item) => item.name === 'input.md' && Number(item.metadata?.size || 0) > 0)) {
      return json(req, { error: '保留的 Markdown 源文件不存在，无法重新构建。' }, 409)
    }
    if (source.has_assets && !sourceObjects.some((item) => item.name === 'assets.zip' && Number(item.metadata?.size || 0) > 0)) {
      return json(req, { error: '原任务的资源压缩包不存在，无法重新构建。' }, 409)
    }

    newJobId = crypto.randomUUID()
    const inputPath = `jobs/${newJobId}/input.md`
    const assetsPath = source.has_assets ? `jobs/${newJobId}/assets.zip` : null
    const expiresAt = new Date(Date.now() + RETENTION_MS).toISOString()

    const { error: insertError } = await admin.from('pdf_jobs').insert({
      id: newJobId,
      user_id: user.id,
      status: 'created',
      input_path: inputPath,
      assets_path: assetsPath,
      output_path: null,
      has_assets: source.has_assets,
      source_filename: source.source_filename,
      document_name: source.document_name,
      source_name: source.source_name || source.source_filename,
      output_filename: source.output_filename,
      theme,
      options: source.options,
      expires_at: expiresAt,
      source_job_id: sourceJobId,
      is_favorite: false,
    })
    if (insertError) throw insertError

    const { error: inputCopyError } = await bucket.copy(source.input_path, inputPath)
    if (inputCopyError) throw inputCopyError

    if (source.has_assets && source.assets_path && assetsPath) {
      const { error: assetsCopyError } = await bucket.copy(source.assets_path, assetsPath)
      if (assetsCopyError) throw assetsCopyError
    }

    return json(req, {
      jobId: newJobId,
      sourceJobId,
      status: 'created',
      theme,
      sourceFilename: source.source_filename,
      expiresAt,
    }, 201)
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('rebuild-pdf-job failed', message)

    if (newJobId) {
      const admin = createAdminClient()
      await admin.storage.from(storageBucket()).remove([
        `jobs/${newJobId}/input.md`,
        `jobs/${newJobId}/assets.zip`,
      ]).catch(() => undefined)
      await admin.from('pdf_jobs').delete().eq('id', newJobId)
    }
    return json(req, { error: '创建重新构建任务失败。' }, 500)
  }
})

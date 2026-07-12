import { handleOptions, json } from '../_shared/cors.ts'
import { normalizeDocumentName } from '../_shared/document-name.ts'
import { createAdminClient, requireUser, safeErrorMessage } from '../_shared/supabase.ts'

type CreateJobBody = {
  theme?: string
  options?: { breaks?: boolean; toc?: boolean }
  hasAssets?: boolean
  sourceFilename?: string
  sourceName?: string
}

const THEME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const ALLOWED_THEMES = new Set(['chatgpt-light', 'academic', 'github'])
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json(req, { error: '只允许 POST 请求。' }, 405)

  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as CreateJobBody
    const theme = String(body.theme || 'chatgpt-light').trim()
    if (!THEME_RE.test(theme) || !ALLOWED_THEMES.has(theme)) {
      return json(req, { error: '不支持的 PDF 主题。' }, 400)
    }

    const document = normalizeDocumentName(
      body.sourceFilename || body.sourceName || 'document.md',
    )
    if (!document) return json(req, { error: '源文件名必须是有效的 Markdown 文件名。' }, 400)

    const breaks = body.options?.breaks ?? true
    const toc = body.options?.toc ?? true
    if (breaks !== true || toc !== true) {
      return json(req, { error: '当前版本仅支持启用软换行和 PDF 书签。' }, 400)
    }

    const hasAssets = body.hasAssets === true
    const jobId = crypto.randomUUID()
    const inputPath = `jobs/${jobId}/input.md`
    const assetsPath = hasAssets ? `jobs/${jobId}/assets.zip` : null
    const expiresAt = new Date(Date.now() + RETENTION_MS).toISOString()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pdf_jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        status: 'created',
        input_path: inputPath,
        assets_path: assetsPath,
        has_assets: hasAssets,
        source_filename: document.sourceFilename,
        document_name: document.documentName,
        source_name: document.sourceFilename,
        output_filename: document.outputFilename,
        theme,
        options: { breaks: true, toc: true },
        expires_at: expiresAt,
        is_favorite: false,
      })
      .select('id,status,input_path,assets_path,source_filename,document_name,source_name,output_filename,theme,options,expires_at')
      .single()

    if (error) throw error
    return json(req, {
      jobId: data.id,
      status: data.status,
      inputPath: data.input_path,
      assetsPath: data.assets_path,
      sourceFilename: data.source_filename,
      sourceName: data.source_name,
      documentName: data.document_name,
      outputFilename: data.output_filename,
      theme: data.theme,
      options: data.options,
      expiresAt: data.expires_at,
    }, 201)
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('create-pdf-job failed', message)
    return json(req, { error: '创建 PDF 任务失败。' }, 500)
  }
})

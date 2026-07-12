import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage } from '../_shared/supabase.ts'

type CreateJobBody = {
  theme?: string
  options?: { breaks?: boolean; toc?: boolean }
  hasAssets?: boolean
  sourceName?: string
}

const THEME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const ALLOWED_THEMES = new Set(['chatgpt-light'])
const MAX_SOURCE_FILENAME_LENGTH = 179
const INVALID_FILENAME_RE = /[\u0000-\u001f\u007f/\\]/

function validateSourceName(value: unknown): string | null {
  const sourceName = String(value || '未命名文档.md')
  if (!sourceName || sourceName.length > MAX_SOURCE_FILENAME_LENGTH) return null
  if (INVALID_FILENAME_RE.test(sourceName)) return null
  if (!sourceName.toLowerCase().endsWith('.md')) return null
  return sourceName
}

function toPdfFilename(sourceName: string): string {
  return `${sourceName.slice(0, -3)}.pdf`
}

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

    const breaks = body.options?.breaks ?? true
    const toc = body.options?.toc ?? true
    if (breaks !== true || toc !== true) {
      return json(req, { error: '当前版本仅支持启用软换行和 PDF 书签。' }, 400)
    }

    const sourceName = validateSourceName(body.sourceName)
    if (!sourceName) return json(req, { error: 'Markdown 文件名无效。' }, 400)
    const outputFilename = toPdfFilename(sourceName)

    const hasAssets = body.hasAssets === true
    const jobId = crypto.randomUUID()
    const inputPath = `jobs/${jobId}/input.md`
    const assetsPath = hasAssets ? `jobs/${jobId}/assets.zip` : null
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
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
        theme,
        options: { breaks: true, toc: true },
        source_name: sourceName,
        output_filename: outputFilename,
        expires_at: expiresAt,
      })
      .select('id,status,input_path,assets_path,theme,options,source_name,output_filename,expires_at')
      .single()

    if (error) throw error
    return json(req, {
      jobId: data.id,
      status: data.status,
      inputPath: data.input_path,
      assetsPath: data.assets_path,
      theme: data.theme,
      options: data.options,
      sourceName: data.source_name,
      outputFilename: data.output_filename,
      expiresAt: data.expires_at,
    }, 201)
  } catch (error) {
    if (safeErrorMessage(error) === 'UNAUTHORIZED') return json(req, { error: '请先登录。' }, 401)
    console.error('create-pdf-job failed')
    return json(req, { error: '创建 PDF 任务失败。' }, 500)
  }
})

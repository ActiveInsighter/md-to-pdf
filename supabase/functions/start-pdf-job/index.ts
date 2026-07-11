import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type StartBody = { jobId?: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENT_STATUSES = new Set(['queued', 'building', 'uploading', 'completed'])

function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name)?.trim() || fallback
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

async function ensureUploaded(admin: ReturnType<typeof createAdminClient>, job: Record<string, unknown>) {
  const prefix = `jobs/${job.id}`
  const { data, error } = await admin.storage.from(storageBucket()).list(prefix, { limit: 100 })
  if (error) throw error
  const input = data.find((item) => item.name === 'input.md')
  const inputSize = Number(input?.metadata?.size || 0)
  if (!input || inputSize <= 0) throw new Error('MARKDOWN_MISSING')
  if (inputSize > 10 * 1024 * 1024) throw new Error('MARKDOWN_TOO_LARGE')

  if (job.has_assets === true) {
    const assets = data.find((item) => item.name === 'assets.zip')
    const assetsSize = Number(assets?.metadata?.size || 0)
    if (!assets || assetsSize <= 0) throw new Error('ASSETS_MISSING')
    if (assetsSize > 50 * 1024 * 1024) throw new Error('ASSETS_TOO_LARGE')
  }
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req)
  if (optionsResponse) return optionsResponse
  if (req.method !== 'POST') return json({ error: '只允许 POST 请求。' }, 405)

  let jobId = ''
  const admin = createAdminClient()
  try {
    const user = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as StartBody
    jobId = String(body.jobId || '').trim()
    if (!UUID_RE.test(jobId)) return json({ error: '任务 ID 格式错误。' }, 400)

    const { data: job, error: jobError } = await admin.from('pdf_jobs').select('*').eq('id', jobId).maybeSingle()
    if (jobError) throw jobError
    if (!job || job.user_id !== user.id) return json({ error: '任务不存在或无权访问。' }, 404)
    if (IDEMPOTENT_STATUSES.has(job.status)) return json({ jobId, status: job.status, idempotent: true })
    if (!new Set(['created', 'uploaded']).has(job.status)) {
      return json({ error: '该任务不能再次启动，请创建新任务。', status: job.status }, 409)
    }

    await ensureUploaded(admin, job)
    if (job.status === 'created') {
      const { error } = await admin.from('pdf_jobs').update({ status: 'uploaded', updated_at: new Date().toISOString() }).eq('id', jobId).eq('status', 'created')
      if (error) throw error
    }

    const { data: queued, error: queueError } = await admin
      .from('pdf_jobs')
      .update({
        status: 'queued',
        attempt_count: Number(job.attempt_count || 0) + 1,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['created', 'uploaded'])
      .select('id,status')
      .maybeSingle()
    if (queueError) throw queueError
    if (!queued) {
      const { data: latest } = await admin.from('pdf_jobs').select('status').eq('id', jobId).single()
      return json({ jobId, status: latest?.status || 'queued', idempotent: true })
    }

    const owner = env('GITHUB_OWNER')
    const repo = env('GITHUB_REPO')
    const workflow = env('GITHUB_WORKFLOW_FILE', 'build-pdf-api.yml')
    const ref = env('GITHUB_WORKFLOW_REF', 'main')
    const token = env('GITHUB_TOKEN')
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'md-to-pdf-supabase-edge-function',
      },
      body: JSON.stringify({ ref, inputs: { job_id: jobId } }),
    })
    if (!response.ok) {
      await admin.from('pdf_jobs').update({
        status: 'failed',
        error_message: `GitHub Actions 排队失败（HTTP ${response.status}）。`,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)
      return json({ error: 'GitHub Actions 排队失败。' }, 502)
    }

    return json({ jobId, status: 'queued' }, 202)
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json({ error: '请先登录。' }, 401)
    if (message === 'MARKDOWN_MISSING') return json({ error: 'Markdown 尚未上传或文件为空。' }, 400)
    if (message === 'MARKDOWN_TOO_LARGE') return json({ error: 'Markdown 超过 10 MiB 限制。' }, 413)
    if (message === 'ASSETS_MISSING') return json({ error: '任务声明了资源文件，但 assets.zip 尚未上传。' }, 400)
    if (message === 'ASSETS_TOO_LARGE') return json({ error: 'assets.zip 超过 50 MiB 限制。' }, 413)
    console.error('start-pdf-job failed')
    if (jobId && UUID_RE.test(jobId)) {
      await admin.from('pdf_jobs').update({
        status: 'failed',
        error_message: '启动 PDF 任务失败。',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).in('status', ['uploaded', 'queued'])
    }
    return json({ error: '启动 PDF 任务失败。' }, 500)
  }
})

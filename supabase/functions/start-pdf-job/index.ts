import { handleOptions, json } from '../_shared/cors.ts'
import { createAdminClient, requireUser, safeErrorMessage, storageBucket } from '../_shared/supabase.ts'

type StartBody = { jobId?: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENT_STATUSES = new Set(['queued', 'building', 'uploading', 'completed'])
const GITHUB_OWNER = 'ActiveInsighter'
const GITHUB_REPO = 'md-to-pdf'
const GITHUB_WORKFLOW = 'build-pdf-api.yml'
const GITHUB_REF = 'main'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function githubHeaders(token: string, jsonBody = false): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'md-to-pdf-supabase-edge-function',
    ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function githubFailure(response: Response, stage: 'repository' | 'workflow' | 'dispatch') {
  const requestId = response.headers.get('x-github-request-id') || null
  const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 300)
  console.error('GitHub request failed', JSON.stringify({
    stage,
    status: response.status,
    requestId,
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    workflow: GITHUB_WORKFLOW,
    ref: GITHUB_REF,
    body,
  }))
  return { stage, status: response.status, requestId, body }
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

    const token = requiredEnv('GITHUB_TOKEN')
    const repoBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`

    const repositoryResponse = await fetch(repoBase, { headers: githubHeaders(token) })
    if (!repositoryResponse.ok) {
      const failure = await githubFailure(repositoryResponse, 'repository')
      const errorMessage = `GitHub Token 无法访问仓库（HTTP ${failure.status}${failure.requestId ? `，请求 ${failure.requestId}` : ''}）。`
      await admin.from('pdf_jobs').update({
        status: 'failed', error_message: errorMessage,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', jobId)
      return json({
        error: 'GitHub Token 无法访问目标仓库，请检查 Fine-grained Token 的仓库范围。',
        githubStage: failure.stage,
        githubStatus: failure.status,
        githubRequestId: failure.requestId,
      }, 502)
    }

    const workflowResponse = await fetch(
      `${repoBase}/actions/workflows/${encodeURIComponent(GITHUB_WORKFLOW)}`,
      { headers: githubHeaders(token) },
    )
    if (!workflowResponse.ok) {
      const failure = await githubFailure(workflowResponse, 'workflow')
      const errorMessage = `GitHub Token 无法访问工作流（HTTP ${failure.status}${failure.requestId ? `，请求 ${failure.requestId}` : ''}）。`
      await admin.from('pdf_jobs').update({
        status: 'failed', error_message: errorMessage,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', jobId)
      return json({
        error: 'GitHub Token 可以访问仓库，但无法访问 PDF 工作流，请检查 Actions 权限。',
        githubStage: failure.stage,
        githubStatus: failure.status,
        githubRequestId: failure.requestId,
      }, 502)
    }

    const dispatchResponse = await fetch(
      `${repoBase}/actions/workflows/${encodeURIComponent(GITHUB_WORKFLOW)}/dispatches`,
      {
        method: 'POST',
        headers: githubHeaders(token, true),
        body: JSON.stringify({ ref: GITHUB_REF, inputs: { job_id: jobId } }),
      },
    )
    if (!dispatchResponse.ok) {
      const failure = await githubFailure(dispatchResponse, 'dispatch')
      const errorMessage = `GitHub Actions 排队失败（HTTP ${failure.status}${failure.requestId ? `，请求 ${failure.requestId}` : ''}）。`
      await admin.from('pdf_jobs').update({
        status: 'failed', error_message: errorMessage,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', jobId)
      return json({
        error: 'GitHub Actions 排队失败，请检查 Token 的 Actions: Read and write 权限。',
        githubStage: failure.stage,
        githubStatus: failure.status,
        githubRequestId: failure.requestId,
      }, 502)
    }

    return json({ jobId, status: 'queued' }, 202)
  } catch (error) {
    const message = safeErrorMessage(error)
    if (message === 'UNAUTHORIZED') return json({ error: '请先登录。' }, 401)
    if (message === 'MARKDOWN_MISSING') return json({ error: 'Markdown 尚未上传或文件为空。' }, 400)
    if (message === 'MARKDOWN_TOO_LARGE') return json({ error: 'Markdown 超过 10 MiB 限制。' }, 413)
    if (message === 'ASSETS_MISSING') return json({ error: '任务声明了资源文件，但 assets.zip 尚未上传。' }, 400)
    if (message === 'ASSETS_TOO_LARGE') return json({ error: 'assets.zip 超过 50 MiB 限制。' }, 413)
    console.error('start-pdf-job failed', message)
    if (jobId && UUID_RE.test(jobId)) {
      await admin.from('pdf_jobs').update({
        status: 'failed', error_message: '启动 PDF 任务失败。',
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', jobId).in('status', ['uploaded', 'queued'])
    }
    return json({ error: '启动 PDF 任务失败。' }, 500)
  }
})

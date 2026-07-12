import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function functionErrorMessage(name, error) {
  const pieces = [`${name} failed`, error instanceof Error ? error.message : String(error)]
  const response = error && typeof error === 'object' ? error.context : null
  if (response && typeof response.clone === 'function') {
    try {
      const text = await response.clone().text()
      if (text) pieces.push(text.slice(0, 500))
    } catch {
      // The response body may already be consumed.
    }
  }
  return pieces.filter(Boolean).join(': ')
}

async function writeDiagnostic(body) {
  await writeFile('smoke-diagnostic.json', `${JSON.stringify(body, null, 2)}\n`, 'utf8')
}

const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '')
const publicKey = requiredEnv('VITE_SUPABASE_ANON_KEY')
const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!serviceKey) throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'pdf-jobs').trim()

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const client = createClient(supabaseUrl, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const runId = String(process.env.GITHUB_RUN_ID || Date.now())
const email = `md-to-pdf-ci-${runId}-${randomBytes(4).toString('hex')}@example.invalid`
const password = `${randomBytes(24).toString('base64url')}Aa1!`
const jobIds = new Set()
let userId = ''
let cancelJobId = ''
let buildJobId = ''
let stage = 'initializing'
let lastJob = null
let cancellationResult = null

async function cleanup() {
  const cleanupErrors = []
  for (const jobId of jobIds) {
    try {
      const { error } = await admin.storage.from(bucket).remove([
        `jobs/${jobId}/input.md`,
        `jobs/${jobId}/assets.zip`,
        `jobs/${jobId}/output.pdf`,
      ])
      if (error) throw error
    } catch (error) {
      cleanupErrors.push(`storage cleanup ${jobId}: ${error instanceof Error ? error.message : String(error)}`)
    }

    try {
      const { error } = await admin.from('pdf_jobs').delete().eq('id', jobId)
      if (error) throw error
    } catch (error) {
      cleanupErrors.push(`job cleanup ${jobId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    await client.auth.signOut()
  } catch {
    // Best-effort cleanup only.
  }

  if (userId) {
    try {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw error
    } catch (error) {
      cleanupErrors.push(`user cleanup: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (cleanupErrors.length > 0) console.warn(cleanupErrors.join('; '))
  return cleanupErrors
}

async function createPdfJob(sourceName) {
  const outputFilename = `${sourceName.slice(0, -3)}.pdf`
  const { data, error } = await client.functions.invoke('create-pdf-job', {
    body: {
      theme: 'chatgpt-light',
      options: { breaks: true, toc: true },
      hasAssets: false,
      sourceName,
    },
  })
  if (error) throw new Error(await functionErrorMessage('create-pdf-job', error))

  const jobId = String(data?.jobId || '')
  assert(/^[0-9a-f-]{36}$/i.test(jobId), 'create-pdf-job returned an invalid job ID')
  assert(data?.inputPath === `jobs/${jobId}/input.md`, 'create-pdf-job returned an unexpected input path')
  assert(data?.sourceName === sourceName, 'create-pdf-job did not preserve the source filename')
  assert(data?.outputFilename === outputFilename, 'create-pdf-job did not derive the PDF filename')
  jobIds.add(jobId)
  return { ...data, jobId }
}

async function uploadMarkdown(path, markdown) {
  const { error } = await client.storage
    .from(bucket)
    .upload(path, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), {
      contentType: 'text/markdown;charset=utf-8',
      upsert: true,
    })
  if (error) throw error
}

async function verifyCancellation(jobId) {
  const { data: cancelled, error: cancelError } = await client.functions.invoke('cancel-pdf-job', {
    body: { jobId },
  })
  if (cancelError) throw new Error(await functionErrorMessage('cancel-pdf-job', cancelError))

  assert(cancelled?.cancelled === true, 'cancel-pdf-job did not confirm cancellation')
  assert(cancelled?.status === 'failed', 'cancel-pdf-job returned an unexpected status')
  assert(cancelled?.idempotent === false, 'first cancellation was unexpectedly idempotent')
  assert(cancelled?.cleanupPending === false, 'cancel-pdf-job did not remove pending Storage objects')

  const { data: row, error: rowError } = await admin
    .from('pdf_jobs')
    .select('status,error_message,input_path,assets_path,completed_at')
    .eq('id', jobId)
    .single()
  if (rowError) throw rowError

  assert(row.status === 'failed', 'cancelled job row is not terminal')
  assert(row.error_message === '用户已取消未启动任务。', 'cancelled job row has an unexpected error summary')
  assert(row.input_path === null && row.assets_path === null, 'cancelled job retained input paths after cleanup')
  assert(Boolean(row.completed_at), 'cancelled job has no completion timestamp')

  const { data: objects, error: listError } = await admin.storage
    .from(bucket)
    .list(`jobs/${jobId}`, { limit: 10 })
  if (listError) throw listError
  assert(
    !(objects || []).some((object) => ['input.md', 'assets.zip', 'output.pdf'].includes(object.name)),
    'cancelled job retained Storage objects',
  )

  const { data: repeated, error: repeatedError } = await client.functions.invoke('cancel-pdf-job', {
    body: { jobId },
  })
  if (repeatedError) throw new Error(await functionErrorMessage('cancel-pdf-job idempotency', repeatedError))
  assert(repeated?.idempotent === true, 'repeated cancellation was not idempotent')
  assert(repeated?.cleanupPending === false, 'repeated cancellation reported pending cleanup')

  const { error: rejectedStartError } = await client.functions.invoke('start-pdf-job', {
    body: { jobId },
  })
  assert(rejectedStartError, 'start-pdf-job accepted a cancelled task')

  return {
    status: row.status,
    cleanupVerified: true,
    idempotentVerified: true,
    restartRejected: true,
  }
}

async function main() {
  stage = 'create-user'
  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createUserError) throw createUserError
  userId = createdUser.user?.id || ''
  assert(userId, 'Admin user creation returned no user ID')
  console.log('1/10 Temporary Supabase user created')

  stage = 'password-login'
  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password })
  if (loginError) throw loginError
  assert(login.session?.access_token, 'Password login returned no session')
  console.log('2/10 Password login succeeded')

  stage = 'create-cancellation-probe'
  const cancellationJob = await createPdfJob('Cancellation probe.md')
  cancelJobId = cancellationJob.jobId
  console.log('3/10 Cancellation probe job created')

  stage = 'upload-cancellation-probe'
  await uploadMarkdown(cancellationJob.inputPath, '# Cancellation smoke probe\n')
  console.log('4/10 Cancellation probe input uploaded')

  stage = 'verify-cancellation'
  cancellationResult = await verifyCancellation(cancelJobId)
  console.log('5/10 Cancellation, cleanup, idempotency and restart rejection verified')

  stage = 'create-pdf-job'
  const sourceName = 'Supabase PDF smoke test.md'
  const expectedOutputFilename = 'Supabase PDF smoke test.pdf'
  const createdJob = await createPdfJob(sourceName)
  buildJobId = createdJob.jobId
  console.log('6/10 PDF build job created with source-derived name')

  stage = 'upload-markdown'
  const markdown = [
    '# Supabase PDF smoke test',
    '',
    '中文、公式与代码构建检查。',
    '',
    '$$E = mc^2$$',
    '',
    '```js',
    "console.log('ok')",
    '```',
    '',
  ].join('\n')
  await uploadMarkdown(createdJob.inputPath, markdown)
  console.log('7/10 Markdown uploaded through authenticated Storage policy')

  stage = 'start-pdf-job'
  const { data: startedJob, error: startJobError } = await client.functions.invoke('start-pdf-job', {
    body: { jobId: buildJobId },
  })
  if (startJobError) {
    const { data: failedJob } = await admin
      .from('pdf_jobs')
      .select('*')
      .eq('id', buildJobId)
      .maybeSingle()
    lastJob = failedJob
    const details = await functionErrorMessage('start-pdf-job', startJobError)
    throw new Error(`${details}; job=${JSON.stringify(failedJob)}`)
  }
  assert(['queued', 'building', 'uploading', 'completed'].includes(String(startedJob?.status || '')), 'start-pdf-job returned an unexpected status')
  console.log('8/10 GitHub Actions build dispatched')

  stage = 'wait-for-build'
  const deadline = Date.now() + 12 * 60 * 1000
  let job = null
  while (Date.now() < deadline) {
    const { data, error } = await admin.from('pdf_jobs').select('*').eq('id', buildJobId).single()
    if (error) throw error
    job = data
    lastJob = data
    console.log(`Polling job: ${job.status}`)
    if (job.status === 'completed') break
    if (job.status === 'failed' || job.status === 'expired') {
      throw new Error(`PDF job ended as ${job.status}: ${job.error_message || 'unknown error'}${job.github_run_url ? `; run=${job.github_run_url}` : ''}`)
    }
    await sleep(5000)
  }
  assert(job?.status === 'completed', 'Timed out waiting for PDF job completion')
  assert(job.source_name === sourceName, 'completed job lost the source filename')
  assert(job.output_filename === expectedOutputFilename, 'completed job lost the output filename')
  console.log('9/10 PDF build completed with persisted filenames')

  stage = 'download-pdf'
  const { data: download, error: downloadError } = await client.functions.invoke('get-pdf-download', {
    body: { jobId: buildJobId },
  })
  if (downloadError) throw new Error(await functionErrorMessage('get-pdf-download', downloadError))
  assert(download?.downloadUrl, 'get-pdf-download returned no signed URL')
  assert(download?.filename === expectedOutputFilename, 'get-pdf-download returned the wrong filename')

  const response = await fetch(download.downloadUrl)
  assert(response.ok, `Signed PDF download failed with HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  assert(bytes.length > 4, 'Downloaded PDF is empty')
  assert(new TextDecoder().decode(bytes.slice(0, 4)) === '%PDF', 'Downloaded file does not have a PDF header')
  console.log(`10/10 Signed PDF download succeeded as ${download.filename} (${bytes.length} bytes)`)

  stage = 'completed'
  return { pdfBytes: bytes.length, filename: download.filename, cancellation: cancellationResult }
}

let failure = null
let result = null
try {
  result = await main()
  console.log('Supabase PDF service smoke test passed')
} catch (error) {
  failure = error
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  const cleanupErrors = await cleanup()
  await writeDiagnostic({
    ok: failure === null,
    runId,
    stage,
    cancelJobId: cancelJobId || null,
    buildJobId: buildJobId || null,
    cancellation: cancellationResult,
    buildRun: lastJob ? {
      status: lastJob.status || null,
      sourceName: lastJob.source_name || null,
      outputFilename: lastJob.output_filename || null,
      errorMessage: lastJob.error_message || null,
      githubRunId: lastJob.github_run_id || null,
      githubRunUrl: lastJob.github_run_url || null,
      githubCommit: lastJob.github_commit || null,
    } : null,
    result,
    error: failure instanceof Error ? failure.message : failure ? String(failure) : null,
    cleanupErrors,
  })
}

if (failure) process.exit(1)

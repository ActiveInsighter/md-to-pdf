import { randomBytes } from 'node:crypto'
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
let userId = ''
let jobId = ''

async function cleanup() {
  const cleanupErrors = []
  if (jobId) {
    try {
      await admin.storage.from(bucket).remove([
        `jobs/${jobId}/input.md`,
        `jobs/${jobId}/assets.zip`,
        `jobs/${jobId}/output.pdf`,
      ])
    } catch (error) {
      cleanupErrors.push(`storage cleanup: ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      await admin.from('pdf_jobs').delete().eq('id', jobId)
    } catch (error) {
      cleanupErrors.push(`job cleanup: ${error instanceof Error ? error.message : String(error)}`)
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

  if (cleanupErrors.length > 0) {
    console.warn(cleanupErrors.join('; '))
  }
}

async function main() {
  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createUserError) throw createUserError
  userId = createdUser.user?.id || ''
  assert(userId, 'Admin user creation returned no user ID')
  console.log('1/7 Temporary Supabase user created')

  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password })
  if (loginError) throw loginError
  assert(login.session?.access_token, 'Password login returned no session')
  console.log('2/7 Password login succeeded')

  const { data: createdJob, error: createJobError } = await client.functions.invoke('create-pdf-job', {
    body: {
      theme: 'chatgpt-light',
      options: { breaks: true, toc: true },
      hasAssets: false,
    },
  })
  if (createJobError) throw new Error(await functionErrorMessage('create-pdf-job', createJobError))
  jobId = String(createdJob?.jobId || '')
  assert(/^[0-9a-f-]{36}$/i.test(jobId), 'create-pdf-job returned an invalid job ID')
  assert(createdJob?.inputPath === `jobs/${jobId}/input.md`, 'create-pdf-job returned an unexpected input path')
  console.log('3/7 PDF job created')

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
  const { error: uploadError } = await client.storage
    .from(bucket)
    .upload(createdJob.inputPath, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), {
      contentType: 'text/markdown;charset=utf-8',
      upsert: true,
    })
  if (uploadError) throw uploadError
  console.log('4/7 Markdown uploaded through authenticated Storage policy')

  const { data: startedJob, error: startJobError } = await client.functions.invoke('start-pdf-job', {
    body: { jobId },
  })
  if (startJobError) {
    const { data: failedJob } = await admin
      .from('pdf_jobs')
      .select('status,error_message')
      .eq('id', jobId)
      .maybeSingle()
    const details = await functionErrorMessage('start-pdf-job', startJobError)
    throw new Error(`${details}; job=${JSON.stringify(failedJob)}`)
  }
  assert(['queued', 'building', 'uploading', 'completed'].includes(String(startedJob?.status || '')), 'start-pdf-job returned an unexpected status')
  console.log('5/7 GitHub Actions build dispatched')

  const deadline = Date.now() + 12 * 60 * 1000
  let job = null
  while (Date.now() < deadline) {
    const { data, error } = await admin.from('pdf_jobs').select('*').eq('id', jobId).single()
    if (error) throw error
    job = data
    console.log(`Polling job: ${job.status}`)
    if (job.status === 'completed') break
    if (job.status === 'failed' || job.status === 'expired') {
      throw new Error(`PDF job ended as ${job.status}: ${job.error_message || 'unknown error'}`)
    }
    await sleep(5000)
  }
  assert(job?.status === 'completed', 'Timed out waiting for PDF job completion')
  console.log('6/7 PDF build completed')

  const { data: download, error: downloadError } = await client.functions.invoke('get-pdf-download', {
    body: { jobId },
  })
  if (downloadError) throw new Error(await functionErrorMessage('get-pdf-download', downloadError))
  assert(download?.downloadUrl, 'get-pdf-download returned no signed URL')

  const response = await fetch(download.downloadUrl)
  assert(response.ok, `Signed PDF download failed with HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  assert(bytes.length > 4, 'Downloaded PDF is empty')
  assert(new TextDecoder().decode(bytes.slice(0, 4)) === '%PDF', 'Downloaded file does not have a PDF header')
  console.log(`7/7 Signed PDF download succeeded (${bytes.length} bytes)`)
}

try {
  await main()
  console.log('Supabase PDF service smoke test passed')
} finally {
  await cleanup()
}

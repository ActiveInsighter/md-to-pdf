import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const command = process.argv[2]
const workDirectory = path.resolve(process.cwd(), '.tmp', 'deployment-auth')
const credentialsPath = path.join(workDirectory, 'credentials.json')
const sessionPath = path.join(workDirectory, 'session.json')
const userIdPath = path.join(workDirectory, 'user-id.txt')

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function secretKey() {
  const value = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value) throw new Error('Missing Supabase admin key for authenticated UI capture.')
  return value
}

function adminClient() {
  return createClient(requiredEnv('VITE_SUPABASE_URL'), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function userClient() {
  return createClient(requiredEnv('VITE_SUPABASE_URL'), requiredEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function authStorageKey() {
  const projectRef = new URL(requiredEnv('VITE_SUPABASE_URL')).hostname.split('.')[0]
  if (!projectRef) throw new Error('Unable to derive Supabase project reference.')
  return `sb-${projectRef}-auth-token`
}

async function prepare() {
  const runId = requiredEnv('GITHUB_RUN_ID').replace(/[^0-9A-Za-z_-]/g, '')
  const suffix = randomBytes(8).toString('hex')
  const email = `ui-capture-${runId}-${suffix}@example.com`
  const password = `Ui9!${randomBytes(24).toString('base64url')}`
  const admin = adminClient()

  await rm(workDirectory, { recursive: true, force: true })
  await mkdir(workDirectory, { recursive: true })

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'cloudflare-pages-ui-capture', run_id: runId },
  })
  if (createError || !created.user) {
    throw new Error(`Unable to create temporary UI capture user: ${createError?.message || 'unknown error'}`)
  }

  const client = userClient()
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError || !signedIn.session) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined)
    throw new Error(`Unable to create temporary browser session: ${signInError?.message || 'unknown error'}`)
  }

  await writeFile(userIdPath, `${created.user.id}\n`, { mode: 0o600 })
  await writeFile(credentialsPath, `${JSON.stringify({ email, password })}\n`, { mode: 0o600 })
  await writeFile(sessionPath, `${JSON.stringify({ storageKey: authStorageKey(), session: signedIn.session })}\n`, { mode: 0o600 })
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  console.log('Prepared temporary confirmed user and browser session for UI capture.')
}

async function cleanupUserObjects(admin, userId) {
  const { data: jobs, error: jobsError } = await admin
    .from('pdf_jobs')
    .select('id,input_path,assets_path,output_path')
    .eq('user_id', userId)
  if (jobsError) throw jobsError

  const objectPaths = [...new Set((jobs || []).flatMap((job) => [job.input_path, job.assets_path, job.output_path]).filter(Boolean))]
  if (objectPaths.length > 0) {
    const { error: storageError } = await admin.storage.from('pdf-jobs').remove(objectPaths)
    if (storageError) throw storageError
  }

  const { error: deleteJobsError } = await admin.from('pdf_jobs').delete().eq('user_id', userId)
  if (deleteJobsError) throw deleteJobsError
}

async function cleanup() {
  const admin = adminClient()
  let cleanupError = null

  try {
    const userId = (await readFile(userIdPath, 'utf8').catch(() => '')).trim()
    if (userId) {
      try {
        await cleanupUserObjects(admin, userId)
      } catch (error) {
        cleanupError = error
      }

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error && !/not found/i.test(error.message) && !cleanupError) cleanupError = error
    }
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }

  if (cleanupError) throw new Error(`Unable to clean temporary UI capture data: ${cleanupError.message}`)
  console.log('Removed temporary UI capture user, tasks, storage objects and session files.')
}

if (command === 'prepare') {
  await prepare()
} else if (command === 'cleanup') {
  await cleanup()
} else {
  throw new Error('Usage: node scripts/manage-ui-capture-user.mjs <prepare|cleanup>')
}

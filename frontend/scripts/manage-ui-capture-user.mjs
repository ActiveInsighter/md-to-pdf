import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const command = process.argv[2]
const workDirectory = path.resolve(process.cwd(), '.tmp', 'deployment-auth')
const credentialsPath = path.join(workDirectory, 'credentials.json')
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

  await writeFile(userIdPath, `${created.user.id}\n`, { mode: 0o600 })
  await writeFile(credentialsPath, `${JSON.stringify({ email, password })}\n`, { mode: 0o600 })
  console.log('Prepared temporary confirmed user credentials for browser UI capture.')
}

async function cleanup() {
  const admin = adminClient()
  let cleanupError = null

  try {
    const rawCredentials = await readFile(credentialsPath, 'utf8').catch(() => '')
    if (rawCredentials) {
      const credentials = JSON.parse(rawCredentials)
      const client = userClient()
      const { error: signInError } = await client.auth.signInWithPassword(credentials)
      if (!signInError) await client.auth.signOut({ scope: 'global' }).catch(() => undefined)
    }

    const userId = (await readFile(userIdPath, 'utf8').catch(() => '')).trim()
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error && !/not found/i.test(error.message)) cleanupError = error
    }
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }

  if (cleanupError) throw new Error(`Unable to delete temporary UI capture user: ${cleanupError.message}`)
  console.log('Removed temporary authenticated UI capture user and credentials.')
}

if (command === 'prepare') {
  await prepare()
} else if (command === 'cleanup') {
  await cleanup()
} else {
  throw new Error('Usage: node scripts/manage-ui-capture-user.mjs <prepare|cleanup>')
}

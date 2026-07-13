import {
  cleanupObjectPaths,
  configureCandidateQuery,
} from './lib/pdf-job-cleanup.mjs'
import { serviceKeyHeaders } from './lib/supabase-service-request.mjs'

const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/$/, '')
const SERVICE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY')
const BUCKET = requiredEnv('SUPABASE_STORAGE_BUCKET')
const PAGE_SIZE = 200

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function headers(extra = {}) {
  return serviceKeyHeaders(SERVICE_KEY, extra)
}

async function parseResponse(response) {
  const text = await response.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.message || data?.error || response.statusText
    throw new Error(`Supabase request failed (${response.status}): ${message}`)
  }
  return data
}

async function candidatePage({ cutoff, lastId, retryExpired }) {
  const url = configureCandidateQuery(new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`), {
    cutoff,
    lastId,
    retryExpired,
  })
  const rows = await parseResponse(await fetch(url, { headers: headers() }))
  return Array.isArray(rows) ? rows : []
}

async function claimExpired(job, cutoff) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`)
  url.searchParams.set('id', `eq.${job.id}`)
  url.searchParams.set('status', `eq.${job.status}`)
  url.searchParams.set('expires_at', `lt.${cutoff}`)
  url.searchParams.set('is_favorite', 'eq.false')
  url.searchParams.set('select', 'id,status,input_path,assets_path,output_path')
  const rows = await parseResponse(await fetch(url, {
    method: 'PATCH',
    headers: headers({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({ status: 'expired', updated_at: new Date().toISOString() }),
  }))
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null
}

async function removeJobObjects(job) {
  const prefixes = cleanupObjectPaths(job)
  if (prefixes.length === 0) return
  await parseResponse(await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes }),
  }))
}

async function clearExpiredPaths(id) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`)
  url.searchParams.set('id', `eq.${id}`)
  url.searchParams.set('status', 'eq.expired')
  await parseResponse(await fetch(url, {
    method: 'PATCH',
    headers: headers({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify({
      input_path: null,
      assets_path: null,
      output_path: null,
      updated_at: new Date().toISOString(),
    }),
  }))
}

async function cleanupPage(job, cutoff, retryExpired) {
  const claimed = retryExpired ? job : await claimExpired(job, cutoff)
  if (!claimed) return false
  await removeJobObjects(claimed)
  await clearExpiredPaths(claimed.id)
  return true
}

async function scanCandidates({ cutoff, retryExpired }) {
  let lastId = ''
  let inspected = 0
  let cleaned = 0

  while (true) {
    const jobs = await candidatePage({ cutoff, lastId, retryExpired })
    if (jobs.length === 0) break
    for (const job of jobs) {
      inspected += 1
      try {
        if (await cleanupPage(job, cutoff, retryExpired)) cleaned += 1
      } catch (error) {
        console.error(`Cleanup failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    lastId = jobs.at(-1).id
    if (jobs.length < PAGE_SIZE) break
  }
  return { inspected, cleaned }
}

async function main() {
  const cutoff = new Date().toISOString()
  const retried = await scanCandidates({ cutoff, retryExpired: true })
  const claimed = await scanCandidates({ cutoff, retryExpired: false })
  console.log(`Expired job cleanup: ${retried.cleaned + claimed.cleaned}/${retried.inspected + claimed.inspected}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

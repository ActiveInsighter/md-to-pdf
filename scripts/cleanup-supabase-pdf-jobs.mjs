import { RetryFetchError, fetchWithRetry, retryPolicyFromEnv } from './http-retry.mjs';

const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
const USE_LEGACY_BEARER = !SERVICE_KEY.startsWith('sb_secret_');
const BUCKET = requiredEnv('SUPABASE_STORAGE_BUCKET');
const RETRY_POLICY = retryPolicyFromEnv();

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    ...(USE_LEGACY_BEARER ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
    ...extra,
  };
}

function requestTarget(url) {
  const target = url instanceof URL ? url : new URL(url);
  return `${target.pathname}${target.search}`;
}

async function request(url, options = {}) {
  const method = options.method || 'GET';
  const target = requestTarget(url);

  try {
    return await fetchWithRetry(url, {
      requestInit: options,
      target,
      policy: RETRY_POLICY,
    });
  } catch (error) {
    if (error instanceof RetryFetchError) {
      if (error.kind === 'timeout') {
        throw new Error(`Supabase request timed out after ${RETRY_POLICY.timeoutMs}ms: ${method} ${target}`);
      }
      throw new Error(`Supabase network error: ${method} ${target}: ${error.cause?.message || error.message}`);
    }
    throw error;
  }
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.message || data?.error || response.statusText;
    throw new Error(`Supabase request failed (${response.status}): ${message}`);
  }
  return data;
}

async function expiredJobs() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`);
  url.searchParams.set('expires_at', `lt.${new Date().toISOString()}`);
  url.searchParams.set('status', 'neq.expired');
  url.searchParams.set('select', 'id');
  url.searchParams.set('limit', '200');
  const response = await request(url, { headers: headers() });
  const rows = await parseResponse(response);
  return Array.isArray(rows) ? rows : [];
}

async function removeJobObjects(id) {
  const prefixes = [
    `jobs/${id}/input.md`,
    `jobs/${id}/assets.zip`,
    `jobs/${id}/output.pdf`,
  ];
  const response = await request(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes }),
  });
  await parseResponse(response);
}

async function markExpired(id) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`);
  url.searchParams.set('id', `eq.${id}`);
  const response = await request(url, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      status: 'expired',
      input_path: null,
      assets_path: null,
      output_path: null,
      updated_at: new Date().toISOString(),
    }),
  });
  await parseResponse(response);
}

async function main() {
  const jobs = await expiredJobs();
  let cleaned = 0;
  let failed = 0;

  console.log(`Request timeout: ${RETRY_POLICY.timeoutMs}ms`);
  console.log(`Request attempts: ${RETRY_POLICY.maxAttempts}`);

  for (const job of jobs) {
    try {
      await removeJobObjects(job.id);
      await markExpired(job.id);
      cleaned += 1;
    } catch (error) {
      failed += 1;
      console.error(`Cleanup failed for ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Expired jobs cleaned: ${cleaned}/${jobs.length}; failed: ${failed}`);
  if (failed > 0) {
    throw new Error(`Cleanup failed for ${failed}/${jobs.length} expired jobs`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

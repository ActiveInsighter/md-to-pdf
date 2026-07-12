const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
const USE_LEGACY_BEARER = !SERVICE_KEY.startsWith('sb_secret_');
const BUCKET = requiredEnv('SUPABASE_STORAGE_BUCKET');
const REQUEST_TIMEOUT_RAW = process.env.REQUEST_TIMEOUT_MS || '15000';
const REQUEST_TIMEOUT_MS = Number(REQUEST_TIMEOUT_RAW);

if (!Number.isInteger(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 100 || REQUEST_TIMEOUT_MS > 120000) {
  throw new Error(`REQUEST_TIMEOUT_MS must be an integer between 100 and 120000; received ${REQUEST_TIMEOUT_RAW}.`);
}

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

function isTimeoutError(error) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

async function request(url, options = {}) {
  const method = options.method || 'GET';
  const target = url instanceof URL ? url : new URL(url);

  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(`Supabase request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${target.pathname}`);
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

  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms`);

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
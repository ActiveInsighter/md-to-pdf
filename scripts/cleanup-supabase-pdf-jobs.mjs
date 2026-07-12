const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SERVICE_KEY) throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
const USE_LEGACY_BEARER = !SERVICE_KEY.startsWith('sb_secret_');
const BUCKET = requiredEnv('SUPABASE_STORAGE_BUCKET');
const REQUEST_TIMEOUT_RAW = process.env.REQUEST_TIMEOUT_MS || '15000';
const REQUEST_TIMEOUT_MS = Number(REQUEST_TIMEOUT_RAW);
const REQUEST_MAX_ATTEMPTS_RAW = process.env.REQUEST_MAX_ATTEMPTS || '3';
const REQUEST_MAX_ATTEMPTS = Number(REQUEST_MAX_ATTEMPTS_RAW);
const RETRY_BASE_DELAY_RAW = process.env.RETRY_BASE_DELAY_MS || '250';
const RETRY_BASE_DELAY_MS = Number(RETRY_BASE_DELAY_RAW);
const RETRY_MAX_DELAY_RAW = process.env.RETRY_MAX_DELAY_MS || '5000';
const RETRY_MAX_DELAY_MS = Number(RETRY_MAX_DELAY_RAW);
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

if (!Number.isInteger(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 100 || REQUEST_TIMEOUT_MS > 120000) {
  throw new Error(`REQUEST_TIMEOUT_MS must be an integer between 100 and 120000; received ${REQUEST_TIMEOUT_RAW}.`);
}

if (!Number.isInteger(REQUEST_MAX_ATTEMPTS) || REQUEST_MAX_ATTEMPTS < 1 || REQUEST_MAX_ATTEMPTS > 5) {
  throw new Error(
    `REQUEST_MAX_ATTEMPTS must be an integer between 1 and 5; received ${REQUEST_MAX_ATTEMPTS_RAW}.`,
  );
}

if (!Number.isInteger(RETRY_BASE_DELAY_MS) || RETRY_BASE_DELAY_MS < 1 || RETRY_BASE_DELAY_MS > 10000) {
  throw new Error(`RETRY_BASE_DELAY_MS must be an integer between 1 and 10000; received ${RETRY_BASE_DELAY_RAW}.`);
}

if (!Number.isInteger(RETRY_MAX_DELAY_MS) || RETRY_MAX_DELAY_MS < RETRY_BASE_DELAY_MS || RETRY_MAX_DELAY_MS > 30000) {
  throw new Error(
    `RETRY_MAX_DELAY_MS must be an integer between RETRY_BASE_DELAY_MS and 30000; received ${RETRY_MAX_DELAY_RAW}.`,
  );
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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), RETRY_MAX_DELAY_MS);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(Math.max(0, timestamp - Date.now()), RETRY_MAX_DELAY_MS);
}

function retryDelay(response, attempt) {
  const retryAfter = parseRetryAfter(response?.headers?.get('retry-after'));
  if (retryAfter !== null) return retryAfter;
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
}

function requestTarget(url) {
  const target = url instanceof URL ? url : new URL(url);
  return `${target.pathname}${target.search}`;
}

function retryReason(error, response) {
  if (response) return `HTTP ${response.status}`;
  if (isTimeoutError(error)) return `request timeout after ${REQUEST_TIMEOUT_MS}ms`;
  return `network error: ${error instanceof Error ? error.message : String(error)}`;
}

async function request(url, options = {}) {
  const method = options.method || 'GET';
  const target = requestTarget(url);

  for (let attempt = 1; attempt <= REQUEST_MAX_ATTEMPTS; attempt += 1) {
    let response = null;
    let requestError = null;

    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      requestError = error;
    }

    if (response && !RETRYABLE_STATUSES.has(response.status)) return response;
    if (response?.ok) return response;

    if (attempt < REQUEST_MAX_ATTEMPTS) {
      const delayMs = retryDelay(response, attempt);
      await response?.body?.cancel().catch(() => {});
      console.warn(
        `Retrying ${method} ${target} in ${delayMs}ms (attempt ${attempt + 1}/${REQUEST_MAX_ATTEMPTS}): ${retryReason(requestError, response)}`,
      );
      await sleep(delayMs);
      continue;
    }

    if (response) return response;
    if (isTimeoutError(requestError)) {
      throw new Error(`Supabase request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${target}`);
    }
    throw new Error(
      `Supabase network error: ${method} ${target}: ${requestError instanceof Error ? requestError.message : String(requestError)}`,
    );
  }

  throw new Error(`Supabase request failed after ${REQUEST_MAX_ATTEMPTS} attempts: ${method} ${target}`);
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
  console.log(`Request attempts: ${REQUEST_MAX_ATTEMPTS}`);
  console.log(`Retry delay range: ${RETRY_BASE_DELAY_MS}-${RETRY_MAX_DELAY_MS}ms`);

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

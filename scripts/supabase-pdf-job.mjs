import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const command = args.shift();
const SUPABASE_URL = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const BUCKET = requiredEnv('SUPABASE_STORAGE_BUCKET');
const JOB_ID = requiredEnv('JOB_ID');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = new Set(['queued', 'building', 'uploading']);

if (!UUID_RE.test(JOB_ID)) {
  throw new Error('JOB_ID is not a valid UUID');
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function option(name, fallback = '') {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function objectPath(filename) {
  return `jobs/${JOB_ID}/${filename}`;
}

function encodedObjectPath(filename) {
  return objectPath(filename).split('/').map(encodeURIComponent).join('/');
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  };
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

async function getJob() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`);
  url.searchParams.set('id', `eq.${JOB_ID}`);
  url.searchParams.set('select', '*');
  const response = await fetch(url, { headers: headers({ Accept: 'application/json' }) });
  const rows = await parseResponse(response);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('PDF job was not found');
  return rows[0];
}

async function patchJob(body) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/pdf_jobs`);
  url.searchParams.set('id', `eq.${JOB_ID}`);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: headers({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  const rows = await parseResponse(response);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('PDF job update affected no rows');
  return rows[0];
}

async function downloadObject(filename, destination, optional = false) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/authenticated/${encodeURIComponent(BUCKET)}/${encodedObjectPath(filename)}`,
    { headers: headers() },
  );
  if (optional && response.status === 404) return false;
  if (!response.ok) await parseResponse(response);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  return true;
}

async function uploadObject(filename, source, contentType) {
  const bytes = await fs.readFile(source);
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodedObjectPath(filename)}`,
    {
      method: 'POST',
      headers: headers({
        'Content-Type': contentType,
        'x-upsert': 'true',
        'cache-control': '3600',
      }),
      body: bytes,
    },
  );
  await parseResponse(response);
}

async function deleteObjects(filenames) {
  const prefixes = filenames.map(objectPath);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes }),
  });
  await parseResponse(response);
}

function runMetadata() {
  const runId = Number(process.env.GITHUB_RUN_ID || 0) || null;
  const repository = process.env.GITHUB_REPOSITORY || '';
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  return {
    github_run_id: runId,
    github_run_url: runId && repository ? `${server}/${repository}/actions/runs/${runId}` : null,
    github_commit: process.env.GITHUB_SHA || null,
  };
}

function sanitizeMessage(value) {
  return String(value || 'PDF 构建失败。').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

async function main() {
  switch (command) {
    case 'get': {
      const output = option('--output');
      if (!output) throw new Error('--output is required');
      const job = await getJob();
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
      break;
    }
    case 'status': {
      const status = args[0];
      if (!new Set(['building', 'uploading']).has(status)) throw new Error('Invalid status command');
      const body = { status, error_message: null, ...runMetadata() };
      if (status === 'building') body.started_at = new Date().toISOString();
      await patchJob(body);
      break;
    }
    case 'download-input': {
      const output = option('--output');
      if (!output) throw new Error('--output is required');
      await downloadObject('input.md', output, false);
      break;
    }
    case 'download-assets': {
      const output = option('--output');
      const githubOutput = option('--github-output');
      if (!output) throw new Error('--output is required');
      const found = await downloadObject('assets.zip', output, true);
      if (githubOutput) await fs.appendFile(githubOutput, `has_assets=${found ? 'true' : 'false'}\n`, 'utf8');
      console.log(found ? 'Assets downloaded.' : 'No assets.zip was uploaded.');
      break;
    }
    case 'upload-output': {
      const input = option('--input');
      if (!input) throw new Error('--input is required');
      await uploadObject('output.pdf', input, 'application/pdf');
      break;
    }
    case 'complete': {
      await patchJob({
        status: 'completed',
        output_path: objectPath('output.pdf'),
        completed_at: new Date().toISOString(),
        error_message: null,
        ...runMetadata(),
      });
      break;
    }
    case 'fail': {
      const message = sanitizeMessage(option('--message', 'PDF 构建失败。'));
      const job = await getJob();
      if (job.status === 'completed' || job.status === 'expired') {
        console.log(`Failure update skipped because job is ${job.status}.`);
        return;
      }
      await patchJob({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
        ...runMetadata(),
      });
      break;
    }
    case 'delete-inputs': {
      await deleteObjects(['input.md', 'assets.zip']);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command || '(none)'}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

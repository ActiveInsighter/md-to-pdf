import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const scriptPath = path.resolve(process.cwd(), 'scripts', 'cleanup-supabase-pdf-jobs.mjs');
const bucket = 'pdf-jobs';
const requestTimeoutMs = 200;

function runCleanup(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Supabase cleanup test process timed out.'));
    }, 5_000);

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function cleanupEnvironment(supabaseUrl) {
  return {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_STORAGE_BUCKET: bucket,
    REQUEST_TIMEOUT_MS: String(requestTimeoutMs),
  };
}

async function runPartialFailureScenario() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({ method: request.method, url: request.url, body });
    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/rest/v1/pdf_jobs') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{ id: 'fail-job' }, { id: 'ok-job' }]));
      return;
    }

    if (request.method === 'DELETE' && url.pathname === `/storage/v1/object/${bucket}`) {
      const payload = JSON.parse(body || '{}');
      const prefixes = Array.isArray(payload.prefixes) ? payload.prefixes : [];
      const failingJob = prefixes.some((prefix) => prefix.startsWith('jobs/fail-job/'));

      if (failingJob) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'simulated storage failure' }));
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/rest/v1/pdf_jobs') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'Not found' }));
  });

  try {
    const supabaseUrl = await listen(server);
    const result = await runCleanup(cleanupEnvironment(supabaseUrl));
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.code, 1, `Expected partial failure to exit 1, received ${result.code}\n${output}`);
    assert.equal(result.signal, null, `Cleanup child exited via signal ${result.signal}`);
    assert.match(output, /Cleanup failed for fail-job: Supabase request failed \(500\): simulated storage failure/);
    assert.match(output, /Expired jobs cleaned: 1\/2; failed: 1/);
    assert.match(output, /Cleanup failed for 1\/2 expired jobs/);

    const deleteRequests = requests.filter((request) => request.method === 'DELETE');
    assert.equal(deleteRequests.length, 2, `Expected both jobs to be attempted: ${JSON.stringify(requests)}`);

    const patchRequests = requests.filter((request) => request.method === 'PATCH');
    assert.equal(patchRequests.length, 1, `Expected only the successful job to be marked expired: ${JSON.stringify(requests)}`);
    assert.match(patchRequests[0].url || '', /id=eq\.ok-job/);
    assert.doesNotMatch(patchRequests[0].url || '', /fail-job/);
  } finally {
    if (server.listening) await close(server);
  }
}

async function runTimeoutContinuationScenario() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({ method: request.method, url: request.url, body });
    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/rest/v1/pdf_jobs') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{ id: 'hang-job' }, { id: 'ok-job' }]));
      return;
    }

    if (request.method === 'DELETE' && url.pathname === `/storage/v1/object/${bucket}`) {
      const payload = JSON.parse(body || '{}');
      const prefixes = Array.isArray(payload.prefixes) ? payload.prefixes : [];
      const hangingJob = prefixes.some((prefix) => prefix.startsWith('jobs/hang-job/'));
      if (hangingJob) return;

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/rest/v1/pdf_jobs') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{}');
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'Not found' }));
  });

  try {
    const supabaseUrl = await listen(server);
    const startedAt = Date.now();
    const result = await runCleanup(cleanupEnvironment(supabaseUrl));
    const elapsedMs = Date.now() - startedAt;
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.code, 1, `Expected timeout scenario to exit 1, received ${result.code}\n${output}`);
    assert.equal(result.signal, null, `Cleanup child exited via signal ${result.signal}`);
    assert.ok(elapsedMs < 2_000, `Timed-out request took too long (${elapsedMs}ms)`);
    assert.match(
      output,
      new RegExp(
        `Cleanup failed for hang-job: Supabase request timed out after ${requestTimeoutMs}ms: DELETE /storage/v1/object/${bucket}`,
      ),
    );
    assert.match(output, /Expired jobs cleaned: 1\/2; failed: 1/);

    const deleteRequests = requests.filter((request) => request.method === 'DELETE');
    assert.equal(deleteRequests.length, 2, `Expected cleanup to continue after timeout: ${JSON.stringify(requests)}`);

    const patchRequests = requests.filter((request) => request.method === 'PATCH');
    assert.equal(patchRequests.length, 1, `Expected only the second job to be marked expired: ${JSON.stringify(requests)}`);
    assert.match(patchRequests[0].url || '', /id=eq\.ok-job/);
    assert.doesNotMatch(patchRequests[0].url || '', /hang-job/);
  } finally {
    if (server.listening) await close(server);
  }
}

await runPartialFailureScenario();
await runTimeoutContinuationScenario();

console.log('Supabase cleanup HTTP tests passed: 2 scenario(s).');
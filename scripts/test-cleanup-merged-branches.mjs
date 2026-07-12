import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const scriptPath = path.resolve(process.cwd(), 'scripts', 'cleanup-merged-branches.mjs');
const repository = 'owner/repository';
const branch = 'feature/http-fixture';
const mergedSha = '1'.repeat(40);
const divergedSha = '2'.repeat(40);
const requestTimeoutMs = 200;
const requestMaxAttempts = 3;

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
      reject(new Error('Branch cleanup test process timed out.'));
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

async function runScenario({
  name,
  dryRun,
  currentSha,
  expectDelete,
  expectedOutputs,
  expectedCode = 0,
  hangGet = false,
  getStatuses = [200],
  retryAfter = null,
  expectedGetCount = 1,
}) {
  const requests = [];
  let getAttempt = 0;
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });

    if (request.method === 'GET' && request.url === `/repos/${repository}/git/ref/heads/${branch}`) {
      getAttempt += 1;
      if (hangGet) return;

      const status = getStatuses[Math.min(getAttempt - 1, getStatuses.length - 1)];
      if (status === 200) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ object: { sha: currentSha } }));
        return;
      }

      response.writeHead(status, {
        'Content-Type': 'application/json',
        ...(retryAfter !== null ? { 'Retry-After': retryAfter } : {}),
      });
      response.end(JSON.stringify({ message: `simulated ${status}` }));
      return;
    }

    if (request.method === 'DELETE' && request.url === `/repos/${repository}/git/refs/heads/${branch}`) {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'Not found' }));
  });

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'branch-cleanup-test-'));
  const eventPath = path.join(temporaryDirectory, 'event.json');

  try {
    const apiBase = await listen(server);
    await fs.writeFile(
      eventPath,
      JSON.stringify({
        pull_request: {
          number: 123,
          merged: true,
          merged_at: '2026-07-12T00:00:00Z',
          head: {
            ref: branch,
            sha: mergedSha,
            repo: { full_name: repository },
          },
        },
      }),
      'utf8',
    );

    const startedAt = Date.now();
    const result = await runCleanup({
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_API_URL: apiBase,
      DRY_RUN: String(dryRun),
      MAX_PULLS: '1',
      REQUEST_TIMEOUT_MS: String(requestTimeoutMs),
      REQUEST_MAX_ATTEMPTS: String(requestMaxAttempts),
      RETRY_BASE_DELAY_MS: '5',
      RETRY_MAX_DELAY_MS: '20',
    });
    const elapsedMs = Date.now() - startedAt;
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.code, expectedCode, `${name}: expected exit ${expectedCode}, received ${result.code}\n${output}`);
    assert.equal(result.signal, null, `${name}: child exited via signal ${result.signal}`);
    for (const expectedOutput of expectedOutputs) {
      assert.match(output, expectedOutput, `${name}: expected output was not found\n${output}`);
    }
    assert.ok(elapsedMs < 2_000, `${name}: retry policy took too long (${elapsedMs}ms)`);

    const getRequests = requests.filter((request) => request.method === 'GET');
    assert.equal(getRequests.length, expectedGetCount, `${name}: unexpected GET count: ${JSON.stringify(requests)}`);

    const deleteRequests = requests.filter((request) => request.method === 'DELETE');
    assert.equal(
      deleteRequests.length,
      expectDelete ? 1 : 0,
      `${name}: unexpected DELETE request count: ${JSON.stringify(requests)}`,
    );
  } finally {
    if (server.listening) await close(server);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await runScenario({
  name: 'dry-run never deletes',
  dryRun: true,
  currentSha: mergedSha,
  expectDelete: false,
  expectedOutputs: [/\[dry-run\] Would delete feature\/http-fixture/],
});

await runScenario({
  name: 'diverged branch never deletes',
  dryRun: false,
  currentSha: divergedSha,
  expectDelete: false,
  expectedOutputs: [/does not match merged PR head/],
});

await runScenario({
  name: 'matching branch deletes once',
  dryRun: false,
  currentSha: mergedSha,
  expectDelete: true,
  expectedOutputs: [/Deleted feature\/http-fixture/],
});

await runScenario({
  name: 'rate limit honors Retry-After and recovers',
  dryRun: true,
  currentSha: mergedSha,
  expectDelete: false,
  getStatuses: [429, 200],
  retryAfter: '0',
  expectedGetCount: 2,
  expectedOutputs: [
    new RegExp(`Retrying GET /repos/${repository}/git/ref/heads/${branch} in 0ms .*HTTP 429`),
    /\[dry-run\] Would delete feature\/http-fixture/,
  ],
});

await runScenario({
  name: 'transient failures stop at max attempts',
  dryRun: false,
  currentSha: mergedSha,
  expectDelete: false,
  expectedCode: 1,
  getStatuses: [503],
  expectedGetCount: requestMaxAttempts,
  expectedOutputs: [
    new RegExp(`attempt ${requestMaxAttempts}/${requestMaxAttempts}`),
    /failed: 503 Service Unavailable/,
  ],
});

await runScenario({
  name: 'permanent client error is not retried',
  dryRun: false,
  currentSha: mergedSha,
  expectDelete: false,
  expectedCode: 1,
  getStatuses: [403],
  expectedGetCount: 1,
  expectedOutputs: [/failed: 403 Forbidden/],
});

await runScenario({
  name: 'hung branch lookup retries then times out',
  dryRun: false,
  currentSha: mergedSha,
  expectDelete: false,
  expectedCode: 1,
  hangGet: true,
  expectedGetCount: requestMaxAttempts,
  expectedOutputs: [
    new RegExp(`request timeout after ${requestTimeoutMs}ms`),
    new RegExp(`GET /repos/${repository}/git/ref/heads/${branch} timed out after ${requestTimeoutMs}ms`),
  ],
});

console.log('Branch cleanup HTTP safety tests passed: 7 scenario(s).');

import fs from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || '';
const eventName = process.env.GITHUB_EVENT_NAME || '';
const eventPath = process.env.GITHUB_EVENT_PATH || '';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const maxPullsRaw = process.env.MAX_PULLS || '100';
const maxPulls = Number(maxPullsRaw);
const requestTimeoutRaw = process.env.REQUEST_TIMEOUT_MS || '15000';
const requestTimeoutMs = Number(requestTimeoutRaw);

if (!token) {
  throw new Error('GITHUB_TOKEN or GH_TOKEN is required.');
}

if (!repository || !repository.includes('/')) {
  throw new Error('GITHUB_REPOSITORY must be owner/repo.');
}

if (!Number.isInteger(maxPulls) || maxPulls < 1 || maxPulls > 500) {
  throw new Error(`MAX_PULLS must be an integer between 1 and 500; received ${maxPullsRaw}.`);
}

if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120000) {
  throw new Error(`REQUEST_TIMEOUT_MS must be an integer between 100 and 120000; received ${requestTimeoutRaw}.`);
}

const protectedBranches = new Set(['main', 'master', 'output', 'gh-pages']);

const cleanupPatterns = [
  /^feature\//,
  /^fix\//,
  /^style\//,
  /^docs\//,
  /^test\//,
  /^export\//,
  /^chore\//,
  /^patch[\/-]/,
  /^ai-export-/,
];

function apiPath(path) {
  return `${apiBase}${path}`;
}

function isTimeoutError(error) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

async function request(method, path, body = null, allow404 = false) {
  let response;

  try {
    response = await fetch(apiPath(path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(`${method} ${path} timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  }

  if (allow404 && response.status === 404) return null;

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}${text ? `\n${text}` : ''}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function encodeBranchRef(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

function shouldCleanupBranch(branch) {
  if (!branch || protectedBranches.has(branch)) return false;
  return cleanupPatterns.some((pattern) => pattern.test(branch));
}

function describeBranch(branch) {
  return shouldCleanupBranch(branch) ? 'eligible' : 'skipped';
}

async function getBranchRef(branch) {
  const encoded = encodeBranchRef(branch);
  return request('GET', `/repos/${repository}/git/ref/heads/${encoded}`, null, true);
}

async function deleteBranch(branch, expectedSha, reason) {
  const encoded = encodeBranchRef(branch);
  const ref = await getBranchRef(branch);
  if (!ref) {
    console.log(`Already gone: ${branch}`);
    return { branch, status: 'missing', reason };
  }

  const currentSha = String(ref.object?.sha || '');
  if (!expectedSha || !currentSha || currentSha !== expectedSha) {
    console.log(
      `Skipping ${branch}: remote SHA ${currentSha || 'unknown'} does not match merged PR head ${expectedSha || 'unknown'}.`,
    );
    return { branch, status: 'diverged', reason: 'remote branch changed after merge' };
  }

  if (dryRun) {
    console.log(`[dry-run] Would delete ${branch} at ${currentSha} (${reason})`);
    return { branch, status: 'dry-run', reason };
  }

  await request('DELETE', `/repos/${repository}/git/refs/heads/${encoded}`);
  console.log(`Deleted ${branch} at ${currentSha} (${reason})`);
  return { branch, status: 'deleted', reason };
}

function branchFromPullRequest(pr) {
  if (!pr?.head?.ref) return null;
  const headRepo = pr.head.repo?.full_name;
  if (headRepo && headRepo !== repository) return null;
  return pr.head.ref;
}

async function cleanupPullRequest(pr, reasonPrefix = 'merged pull request') {
  const branch = branchFromPullRequest(pr);
  if (!branch) {
    console.log(`Skipping PR #${pr?.number ?? '?'}: no same-repo head branch.`);
    return null;
  }

  if (!pr.merged && !pr.merged_at) {
    console.log(`Skipping PR #${pr.number}: not merged.`);
    return { branch, status: 'skipped', reason: 'not merged' };
  }

  if (!shouldCleanupBranch(branch)) {
    console.log(`Skipping ${branch}: ${describeBranch(branch)} by policy.`);
    return { branch, status: 'skipped', reason: 'not eligible by policy' };
  }

  const expectedSha = String(pr.head?.sha || '');
  if (!expectedSha) {
    console.log(`Skipping ${branch}: merged PR head SHA is unavailable.`);
    return { branch, status: 'skipped', reason: 'missing merged PR head SHA' };
  }

  return deleteBranch(branch, expectedSha, `${reasonPrefix} #${pr.number}`);
}

async function cleanupEventPullRequest() {
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is required for pull_request cleanup.');
  }

  const event = JSON.parse(await fs.readFile(eventPath, 'utf8'));
  const pr = event.pull_request;
  if (!pr) {
    console.log('No pull_request payload found.');
    return [];
  }

  const result = await cleanupPullRequest(pr, 'pull_request.closed merged');
  return result ? [result] : [];
}

async function listClosedPullRequests() {
  const all = [];
  let page = 1;

  while (all.length < maxPulls) {
    const pulls = await request(
      'GET',
      `/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
    );
    if (!Array.isArray(pulls) || pulls.length === 0) break;
    all.push(...pulls);
    if (pulls.length < 100) break;
    page += 1;
  }

  return all.slice(0, maxPulls);
}

async function cleanupRecentMergedPullRequests() {
  const pulls = await listClosedPullRequests();
  const results = [];

  for (const pr of pulls) {
    if (!pr.merged_at) continue;
    const result = await cleanupPullRequest(pr, 'manual recent merged cleanup');
    if (result) results.push(result);
  }

  return results;
}

async function main() {
  console.log(`Repository: ${repository}`);
  console.log(`Event: ${eventName || 'manual/local'}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Max closed pull requests: ${maxPulls}`);
  console.log(`Request timeout: ${requestTimeoutMs}ms`);
  console.log(`Protected branches: ${[...protectedBranches].join(', ')}`);

  const results =
    eventName === 'pull_request'
      ? await cleanupEventPullRequest()
      : await cleanupRecentMergedPullRequests();

  const summary = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`Cleanup summary: ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
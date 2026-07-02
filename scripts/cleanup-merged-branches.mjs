import fs from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || '';
const eventName = process.env.GITHUB_EVENT_NAME || '';
const eventPath = process.env.GITHUB_EVENT_PATH || '';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const maxPulls = Number(process.env.MAX_PULLS || 100);

if (!token) {
  throw new Error('GITHUB_TOKEN or GH_TOKEN is required.');
}

if (!repository || !repository.includes('/')) {
  throw new Error('GITHUB_REPOSITORY must be owner/repo.');
}

const protectedBranches = new Set([
  'main',
  'master',
  'output',
  'gh-pages'
]);

const cleanupPatterns = [
  /^feature\//,
  /^fix\//,
  /^style\//,
  /^docs\//,
  /^test\//,
  /^export\//,
  /^chore\//,
  /^patch[\/-]/,
  /^ai-export-/
];

function apiPath(path) {
  return `${apiBase}${path}`;
}

async function request(method, path, body = null, allow404 = false) {
  const response = await fetch(apiPath(path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

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

async function branchExists(branch) {
  const encoded = encodeBranchRef(branch);
  const result = await request('GET', `/repos/${repository}/git/ref/heads/${encoded}`, null, true);
  return Boolean(result);
}

async function deleteBranch(branch, reason) {
  const encoded = encodeBranchRef(branch);
  const exists = await branchExists(branch);
  if (!exists) {
    console.log(`Already gone: ${branch}`);
    return { branch, status: 'missing', reason };
  }

  if (dryRun) {
    console.log(`[dry-run] Would delete ${branch} (${reason})`);
    return { branch, status: 'dry-run', reason };
  }

  await request('DELETE', `/repos/${repository}/git/refs/heads/${encoded}`);
  console.log(`Deleted ${branch} (${reason})`);
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

  return deleteBranch(branch, `${reasonPrefix} #${pr.number}`);
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
    const pulls = await request('GET', `/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
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
  console.log(`Protected branches: ${[...protectedBranches].join(', ')}`);

  const results = eventName === 'pull_request'
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

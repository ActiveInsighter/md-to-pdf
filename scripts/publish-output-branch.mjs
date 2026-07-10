import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathExists } from './lib/path-utils.mjs';

const projectRoot = process.cwd();
const outputBranch = process.env.OUTPUT_BRANCH || 'output';
const tmpDir = path.join(os.tmpdir(), `obsidian-pdf-output-${process.pid}`);
const distQueue = path.resolve(projectRoot, 'dist', 'queue');
const distRoot = path.resolve(projectRoot, 'dist');
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8'
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
  }

  return result;
}

async function copyContents(from, to) {
  if (!(await pathExists(from))) return false;
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from);
  if (entries.length === 0) return false;

  for (const entry of entries) {
    await fs.cp(path.join(from, entry), path.join(to, entry), { recursive: true, force: true });
  }

  return true;
}

async function clearWorktree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
  }
}

function localBranchExists(branch) {
  const result = run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { stdio: 'ignore', allowFailure: true });
  return result.status === 0;
}

async function prepareWorktree() {
  await fs.rm(tmpDir, { recursive: true, force: true });
  run('git', ['fetch', 'origin', `${outputBranch}:${outputBranch}`], { allowFailure: true });

  if (localBranchExists(outputBranch)) {
    run('git', ['worktree', 'add', tmpDir, outputBranch]);
    return;
  }

  run('git', ['worktree', 'add', '--detach', tmpDir]);
  run('git', ['checkout', '--orphan', outputBranch], { cwd: tmpDir });
  await clearWorktree(tmpDir);
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# PDF Output\n\nThis branch stores generated PDF/HTML outputs from the build queue.\n', 'utf8');
}

async function copyOutputs() {
  let copied = false;

  if (await pathExists(distQueue)) {
    copied = await copyContents(distQueue, tmpDir) || copied;
  }

  if (!copied && await pathExists(distRoot)) {
    const manualDir = path.join(tmpDir, 'manual-runs', String(runId));
    copied = await copyContents(distRoot, manualDir) || copied;
  }

  const latestLog = path.resolve(projectRoot, '.github', 'latest-build-log.txt');
  if (await pathExists(latestLog)) {
    await fs.mkdir(path.join(tmpDir, 'logs'), { recursive: true });
    await fs.copyFile(latestLog, path.join(tmpDir, 'logs', `${runId}.txt`));
  }

  return copied;
}

function pushWithRetry() {
  const firstPush = run('git', ['push', 'origin', `HEAD:${outputBranch}`], {
    cwd: tmpDir,
    allowFailure: true
  });
  if (firstPush.status === 0) return;

  console.log('Initial output push failed; rebasing on the latest remote output branch and retrying.');
  run('git', ['fetch', 'origin', outputBranch], { cwd: tmpDir });
  run('git', ['rebase', `origin/${outputBranch}`], { cwd: tmpDir });
  run('git', ['push', 'origin', `HEAD:${outputBranch}`], { cwd: tmpDir });
}

async function commitAndPush() {
  run('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: tmpDir });
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { cwd: tmpDir });
  run('git', ['add', '-A'], { cwd: tmpDir });

  const diff = run('git', ['diff', '--cached', '--quiet'], { cwd: tmpDir, stdio: 'ignore', allowFailure: true });
  if (diff.status === 0) {
    console.log('No generated output changes to publish.');
    return;
  }

  run('git', ['commit', '-m', `Publish generated PDFs from run ${runId} [skip ci]`], { cwd: tmpDir });
  pushWithRetry();
}

async function main() {
  if (process.env.PUBLISH_OUTPUT_BRANCH === 'false') {
    console.log('Skipping output branch publish because PUBLISH_OUTPUT_BRANCH=false.');
    return;
  }

  if (!(await pathExists(distRoot))) {
    console.log('No dist directory exists. Nothing to publish.');
    return;
  }

  await prepareWorktree();
  try {
    const copied = await copyOutputs();
    if (!copied) {
      console.log('No generated outputs found. Nothing to publish.');
      return;
    }
    await commitAndPush();
  } finally {
    run('git', ['worktree', 'remove', '--force', tmpDir], { allowFailure: true });
  }
}

main().catch((error) => {
  console.error(error);
  run('git', ['worktree', 'remove', '--force', tmpDir], { allowFailure: true });
  process.exit(1);
});

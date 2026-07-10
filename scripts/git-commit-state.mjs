import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const message = process.argv.slice(2).join(' ') || 'Record workflow state [skip ci]';
const stateFiles = [
  '.github/latest-run-id.txt',
  '.github/latest-run-url.txt',
  '.github/latest-run.json',
  '.github/build-history.json',
  '.github/latest-build-log.txt'
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options
  });
  return result.status ?? 1;
}

function pushWithRetry() {
  const firstPush = run('git', ['push', 'origin', 'HEAD:main'], { stdio: 'inherit' });
  if (firstPush === 0) return 0;

  console.log('Initial state push failed; rebasing on origin/main and retrying.');
  if (run('git', ['fetch', 'origin', 'main']) !== 0) return 1;
  if (run('git', ['rebase', 'origin/main']) !== 0) return 1;
  return run('git', ['push', 'origin', 'HEAD:main']);
}

run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);

const existingFiles = stateFiles.filter((file) => existsSync(file));
if (existingFiles.length === 0) {
  console.log('No workflow state files exist yet.');
  process.exit(0);
}

run('git', ['add', ...existingFiles]);

const diffStatus = run('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' });
if (diffStatus === 0) {
  console.log('No workflow state changes to commit.');
  process.exit(0);
}

const commitStatus = run('git', ['commit', '-m', message]);
if (commitStatus !== 0) {
  process.exit(commitStatus);
}

process.exit(pushWithRetry());

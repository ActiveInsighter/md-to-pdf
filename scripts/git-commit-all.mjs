import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const separatorIndex = rawArgs.indexOf('--');
const messageArgs = separatorIndex >= 0 ? rawArgs.slice(0, separatorIndex) : rawArgs;
const requestedPaths = separatorIndex >= 0 ? rawArgs.slice(separatorIndex + 1) : [];
const message = messageArgs.join(' ') || 'Update repository [skip ci]';
const paths = requestedPaths.length > 0
  ? requestedPaths
  : ['inbox', '.github/consumed-paths.txt', '.github/last-build-summary.json'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options
  });
  return result.status ?? 1;
}

function pushWithRetry() {
  const firstPush = run('git', ['push', 'origin', 'HEAD:main']);
  if (firstPush === 0) return 0;

  console.log('Initial queue-consume push failed; rebasing on origin/main and retrying.');
  if (run('git', ['fetch', 'origin', 'main']) !== 0) return 1;
  if (run('git', ['rebase', 'origin/main']) !== 0) return 1;
  return run('git', ['push', 'origin', 'HEAD:main']);
}

run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
run('git', ['add', '-A', '--', ...paths]);

const diffStatus = run('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' });
if (diffStatus === 0) {
  console.log('No allowed repository changes to commit.');
  process.exit(0);
}

const commitStatus = run('git', ['commit', '-m', message]);
if (commitStatus !== 0) process.exit(commitStatus);

process.exit(pushWithRetry());

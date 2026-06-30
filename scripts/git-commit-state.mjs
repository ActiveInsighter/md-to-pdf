import { spawnSync } from 'node:child_process';

const message = process.argv.slice(2).join(' ') || 'Record workflow state [skip ci]';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options
  });
  return result.status ?? 1;
}

run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
run('git', ['add', '.github/latest-run-id.txt', '.github/latest-run-url.txt', '.github/latest-run.json', '.github/build-history.json', '.github/latest-build-log.txt']);

const diffStatus = run('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' });
if (diffStatus === 0) {
  console.log('No workflow state changes to commit.');
  process.exit(0);
}

const commitStatus = run('git', ['commit', '-m', message]);
if (commitStatus !== 0) {
  process.exit(commitStatus);
}

const pushStatus = run('git', ['push']);
process.exit(pushStatus);

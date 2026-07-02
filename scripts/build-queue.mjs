import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { findManifestInDayDir, loadManifest, resolveManifestTarget } from './lib/manifest.mjs';
import { pathExists, toPosix } from './lib/path-utils.mjs';

const projectRoot = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const consumedPathsFile = path.resolve(projectRoot, '.github', 'consumed-paths.txt');
const summaryFile = path.resolve(projectRoot, '.github', 'last-build-summary.json');

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }

  return result.stdout ?? '';
}

function runNode(script, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

function isZeroSha(sha) {
  return !sha || /^0{40}$/.test(String(sha));
}

function changedFilesFromGit() {
  const before = process.env.BEFORE_SHA || process.env.GITHUB_EVENT_BEFORE || '';
  const current = process.env.CURRENT_SHA || process.env.GITHUB_SHA || 'HEAD';

  if (isZeroSha(before)) {
    return runGit(['ls-files', 'inbox']).split(/\r?\n/).filter(Boolean);
  }

  runGit(['fetch', '--no-tags', '--depth=50', 'origin', current], { allowFailure: true });
  return runGit(['diff', '--name-only', before, current]).split(/\r?\n/).filter(Boolean);
}

async function manifestFromDayDirRel(dayDirRel) {
  const manifest = await findManifestInDayDir(path.resolve(projectRoot, dayDirRel));
  return manifest ? toPosix(path.relative(projectRoot, manifest)) : null;
}

async function manifestsFromChangedFiles(files) {
  const manifests = new Set();

  for (const file of files.map(toPosix)) {
    if (/^inbox\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\/manifest\.(ya?ml|json)$/i.test(file)) {
      manifests.add(file);
      continue;
    }

    const match = file.match(/^(inbox\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2})\//);
    if (match) {
      const manifest = await manifestFromDayDirRel(match[1]);
      if (manifest) manifests.add(manifest);
    }
  }

  return [...manifests].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

async function explicitManifestArgs() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (args.length > 0) {
    const resolved = [];
    for (const arg of args) {
      const manifest = await resolveManifestTarget(arg, projectRoot);
      resolved.push(toPosix(path.relative(projectRoot, manifest)));
    }
    return resolved;
  }

  const envManifests = process.env.BUILD_MANIFESTS || process.env.MANIFESTS || '';
  if (envManifests.trim()) {
    const resolved = [];
    for (const item of envManifests.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean)) {
      const manifest = await resolveManifestTarget(item, projectRoot);
      resolved.push(toPosix(path.relative(projectRoot, manifest)));
    }
    return resolved;
  }

  if (process.env.BUILD_DAY?.trim()) {
    const manifest = await resolveManifestTarget(process.env.BUILD_DAY.trim(), projectRoot);
    return [toPosix(path.relative(projectRoot, manifest))];
  }

  return [];
}

async function main() {
  await fs.mkdir(path.dirname(consumedPathsFile), { recursive: true });
  await fs.writeFile(consumedPathsFile, '', 'utf8');

  let manifests = await explicitManifestArgs();
  if (manifests.length === 0) {
    const changedFiles = changedFilesFromGit();
    console.log(`Changed files:\n${changedFiles.map((file) => `- ${file}`).join('\n') || '(none)'}`);
    manifests = await manifestsFromChangedFiles(changedFiles);
  }

  manifests = [...new Set(manifests)].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  if (manifests.length === 0) {
    const summary = { status: 'skipped', reason: 'No inbox manifest found for this change set.', manifests: [] };
    await fs.writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(summary.reason);
    return;
  }

  console.log(`Queue manifests:\n${manifests.map((file) => `- ${file}`).join('\n')}`);

  const built = [];
  const consumed = [];

  for (const manifestRel of manifests) {
    if (!(await pathExists(path.resolve(projectRoot, manifestRel)))) {
      throw new Error(`Manifest no longer exists: ${manifestRel}`);
    }

    await runNode('scripts/build-day.mjs', dryRun ? [manifestRel, '--dry-run'] : [manifestRel]);
    const manifest = await loadManifest(manifestRel, projectRoot);
    built.push({ manifest: manifest.manifestRel, root: manifest.rootRel, date: manifest.date });

    if (!dryRun && manifest.consume.delete_after_success) {
      consumed.push(manifest.rootRel);
    }
  }

  await fs.writeFile(consumedPathsFile, `${consumed.join('\n')}${consumed.length ? '\n' : ''}`, 'utf8');
  const summary = { status: 'success', manifests: built, consumed };
  await fs.writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`Built ${built.length} manifest(s).`);
  if (consumed.length > 0) {
    console.log(`Will consume after successful publish:\n${consumed.map((item) => `- ${item}`).join('\n')}`);
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await fs.mkdir(path.dirname(summaryFile), { recursive: true });
    await fs.writeFile(summaryFile, `${JSON.stringify({ status: 'failure', error: String(error?.message || error) }, null, 2)}\n`, 'utf8');
  } catch {}
  process.exit(1);
});

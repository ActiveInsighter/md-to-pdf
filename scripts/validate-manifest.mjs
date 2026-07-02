import path from 'node:path';
import { loadManifest, resolveJobInputs, resolveManifestTarget } from './lib/manifest.mjs';
import { toPosix } from './lib/path-utils.mjs';

const projectRoot = process.cwd();
const targets = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

async function validateTarget(target) {
  const manifestPath = await resolveManifestTarget(target, projectRoot);
  const manifest = await loadManifest(manifestPath, projectRoot);

  console.log(`Manifest OK: ${manifest.manifestRel}`);
  console.log(`Date: ${manifest.date}`);
  console.log(`Jobs: ${manifest.jobs.length}`);

  for (const job of manifest.jobs) {
    const inputs = await resolveJobInputs(manifest, job);
    console.log(`- ${job.id} (${job.type}): ${inputs.length} input(s)`);
    for (const input of inputs) {
      console.log(`  - ${toPosix(path.relative(projectRoot, input))}`);
    }
  }
}

async function main() {
  if (targets.length === 0) {
    throw new Error('Usage: node scripts/validate-manifest.mjs <manifest-path-or-day> [...more]');
  }

  for (const target of targets) {
    await validateTarget(target);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

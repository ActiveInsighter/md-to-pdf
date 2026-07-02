import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSafeRelativePath, ensureInside, pathExists, removeEmptyParents } from './lib/path-utils.mjs';

const projectRoot = process.cwd();
const inboxRoot = path.resolve(projectRoot, 'inbox');
const consumedPathsFile = path.resolve(projectRoot, '.github', 'consumed-paths.txt');

async function main() {
  if (!(await pathExists(consumedPathsFile))) {
    console.log('No consumed paths file found.');
    return;
  }

  const paths = (await fs.readFile(consumedPathsFile, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (paths.length === 0) {
    console.log('No inbox paths to consume.');
    return;
  }

  for (const item of paths) {
    const rel = assertSafeRelativePath(item, 'consumed path');
    if (!rel.startsWith('inbox/')) {
      throw new Error(`Consumed path must live under inbox/: ${rel}`);
    }

    const absolute = ensureInside(inboxRoot, path.resolve(projectRoot, rel), 'consumed path');
    console.log(`Removing ${rel}`);
    await fs.rm(absolute, { recursive: true, force: true });
    await removeEmptyParents(path.dirname(absolute), inboxRoot);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

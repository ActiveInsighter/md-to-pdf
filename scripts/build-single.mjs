import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertSafeRelativePath, ensureInside, pathExists, toPosix } from './lib/path-utils.mjs';

const projectRoot = process.cwd();
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const inputArg = args[0];
const outputArg = args[1];

function inferOutput(inputRel) {
  const normalized = toPosix(inputRel);
  const dateMatch = normalized.match(/^inbox\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\//);
  const basename = `${path.basename(normalized, path.extname(normalized))}.pdf`;

  if (dateMatch) {
    return `dist/single/${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}/${basename}`;
  }

  return `dist/single/manual/${basename}`;
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

async function main() {
  if (!inputArg) {
    throw new Error('Usage: node scripts/build-single.mjs <path/to/file.md> [dist/output.pdf]');
  }

  const inputRel = assertSafeRelativePath(inputArg, 'input');
  const inputPath = path.resolve(projectRoot, inputRel);
  ensureInside(projectRoot, inputPath, 'input');

  if (!/\.md$/i.test(inputPath)) {
    throw new Error(`input must be a Markdown file: ${inputArg}`);
  }
  if (!(await pathExists(inputPath))) {
    throw new Error(`input does not exist: ${inputArg}`);
  }

  const outputRel = outputArg ? assertSafeRelativePath(outputArg, 'output') : inferOutput(inputRel);
  if (!/\.pdf$/i.test(outputRel)) {
    throw new Error(`output must end with .pdf: ${outputRel}`);
  }

  const outputPath = path.resolve(projectRoot, outputRel);
  ensureInside(path.resolve(projectRoot, 'dist'), outputPath, 'output');

  await runNode('scripts/build-pdf.mjs', [inputRel, outputRel]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

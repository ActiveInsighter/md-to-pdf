import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const logPath = path.resolve(projectRoot, '.github/latest-build-log.txt');
const mode = (process.env.BUILD_MODE || 'queue').trim() || 'queue';
const source = (process.env.BUILD_SOURCE || '').trim();
const day = (process.env.BUILD_DAY || '').trim();
const postprocessEnabled = process.env.PDF_POSTPROCESS !== 'false';

await fsp.mkdir(path.dirname(logPath), { recursive: true });

const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function write(chunk) {
  process.stdout.write(chunk);
  logStream.write(chunk);
}

function writeErr(chunk) {
  process.stderr.write(chunk);
  logStream.write(chunk);
}

function commandForMode() {
  if (mode === 'notes') {
    return ['scripts/build-pdf.mjs', 'notes.md', 'dist/notes.pdf'];
  }

  if (mode === 'single') {
    if (!source) throw new Error('BUILD_SOURCE is required when BUILD_MODE=single.');
    return ['scripts/build-single.mjs', source];
  }

  if (mode === 'day') {
    const target = day || source;
    if (!target) throw new Error('BUILD_DAY or BUILD_SOURCE is required when BUILD_MODE=day.');
    return ['scripts/build-day.mjs', target];
  }

  if (mode === 'queue') {
    return ['scripts/build-queue.mjs'];
  }

  if (mode === 'validate') {
    const target = day || source;
    if (!target) throw new Error('BUILD_DAY or BUILD_SOURCE is required when BUILD_MODE=validate.');
    return ['scripts/validate-manifest.mjs', target];
  }

  throw new Error(`Unsupported BUILD_MODE: ${mode}`);
}

function runNode(commandArgs, sectionTitle) {
  write(`\n## ${sectionTitle}\n`);
  write(`started_at=${new Date().toISOString()}\n`);
  write(`command=node ${commandArgs.join(' ')}\n\n`);

  const child = spawn(process.execPath, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', write);
  child.stderr.on('data', writeErr);

  return new Promise((resolve) => {
    child.on('error', (error) => {
      writeErr(`${error.stack || error}\n`);
      resolve(1);
    });
    child.on('close', (code) => {
      write(`\nfinished_at=${new Date().toISOString()}\n`);
      write(`exit_code=${code}\n`);
      resolve(code ?? 1);
    });
  });
}

const commandArgs = commandForMode();
write(`\n## PDF pipeline\n`);
write(`mode=${mode}\n`);
write(`postprocess=${postprocessEnabled && mode !== 'validate' ? 'enabled' : 'disabled'}\n`);

let exitCode = await runNode(commandArgs, 'PDF build');

if (exitCode === 0 && postprocessEnabled && mode !== 'validate') {
  exitCode = await runNode(['scripts/postprocess-pdfs.mjs'], 'PDF preview and quality postprocessing');
}

await new Promise((resolve) => logStream.end(resolve));
process.exit(exitCode);

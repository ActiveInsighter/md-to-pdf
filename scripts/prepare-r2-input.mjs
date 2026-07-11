import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const projectRoot = process.cwd();
const maxInputBytes = Number(process.env.PDF_MAX_INPUT_BYTES || 50 * 1024 * 1024);
const maxExtractedBytes = Number(process.env.PDF_MAX_EXTRACTED_BYTES || 200 * 1024 * 1024);
const maxExtractedFiles = Number(process.env.PDF_MAX_EXTRACTED_FILES || 2000);

function argValue(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1].trim();
  }
  return '';
}

function resolveInsideRoot(value, label) {
  const resolved = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the repository working directory.`);
  }
  return resolved;
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function validateArchiveEntry(entry) {
  const normalized = entry.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`ZIP contains an absolute path: ${entry}`);
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`ZIP contains a path traversal entry: ${entry}`);
  }
  if (normalized.includes('\0')) {
    throw new Error('ZIP contains an invalid null byte in a path.');
  }
}

async function inspectZip(zipPath) {
  const listing = await run('unzip', ['-Z', '-1', zipPath]);
  const entries = listing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (entries.length === 0) throw new Error('ZIP archive is empty.');
  if (entries.length > maxExtractedFiles) {
    throw new Error(`ZIP contains too many entries (${entries.length} > ${maxExtractedFiles}).`);
  }
  entries.forEach(validateArchiveEntry);

  const permissionListing = await run('zipinfo', ['-l', zipPath]);
  for (const line of permissionListing.split(/\r?\n/)) {
    if (/^\s*l[rwxstST-]{9}\s/.test(line)) {
      throw new Error('ZIP contains a symbolic link entry, which is not allowed.');
    }
  }

  const verboseListing = await run('unzip', ['-l', zipPath]);
  let totalBytes = 0;
  for (const line of verboseListing.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/);
    if (!match) continue;
    totalBytes += Number(match[1]);
  }
  if (totalBytes > maxExtractedBytes) {
    throw new Error(`ZIP expands to too much data (${totalBytes} > ${maxExtractedBytes} bytes).`);
  }
}

async function walkFiles(directory) {
  const results = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const stats = await fs.lstat(fullPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`ZIP extraction produced a symbolic link, which is not allowed: ${path.relative(directory, fullPath)}`);
    }
    if (stats.isDirectory()) results.push(...await walkFiles(fullPath));
    else if (stats.isFile()) results.push(fullPath);
  }
  return results;
}

function chooseMarkdown(files, extractedRoot) {
  const markdownFiles = files.filter((file) => /\.md$/i.test(file));
  if (markdownFiles.length === 0) throw new Error('No Markdown file was found in the uploaded ZIP.');

  const preferredNames = ['source.md', 'index.md', 'readme.md'];
  for (const preferred of preferredNames) {
    const matches = markdownFiles.filter((file) => path.basename(file).toLowerCase() === preferred);
    if (matches.length === 1) return matches[0];
  }
  if (markdownFiles.length === 1) return markdownFiles[0];

  const rootMarkdown = markdownFiles.filter((file) => path.dirname(file) === extractedRoot);
  if (rootMarkdown.length === 1) return rootMarkdown[0];

  throw new Error('The ZIP contains multiple Markdown files. Name the entry document source.md or index.md.');
}

async function main() {
  const inputArg = argValue('--input');
  const inputType = argValue('--type').toLowerCase();
  const workDirArg = argValue('--work-dir') || 'work/source';
  if (!inputArg) throw new Error('--input is required.');
  if (!['md', 'zip'].includes(inputType)) throw new Error('--type must be md or zip.');

  const inputPath = resolveInsideRoot(inputArg, 'Input path');
  const workDir = resolveInsideRoot(workDirArg, 'Work directory');
  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error('Input path is not a file.');
  if (stat.size <= 0) throw new Error('Input file is empty.');
  if (stat.size > maxInputBytes) throw new Error(`Input file exceeds ${maxInputBytes} bytes.`);

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });

  let markdownPath;
  if (inputType === 'md') {
    markdownPath = path.join(workDir, 'source.md');
    await fs.copyFile(inputPath, markdownPath);
  } else {
    await inspectZip(inputPath);
    await run('unzip', ['-q', inputPath, '-d', workDir]);
    const files = await walkFiles(workDir);
    if (files.length > maxExtractedFiles) throw new Error('Extracted file count exceeds the configured limit.');
    markdownPath = chooseMarkdown(files, workDir);
  }

  const relativeMarkdownPath = path.relative(projectRoot, markdownPath).replaceAll(path.sep, '/');
  console.log(relativeMarkdownPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

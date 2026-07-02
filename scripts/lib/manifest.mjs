import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  assertSafeRelativePath,
  ensureInside,
  isPlainObject,
  listMarkdownFiles,
  pathExists,
  toPosix
} from './path-utils.mjs';

export const INBOX_DIR = 'inbox';
export const MANIFEST_FILENAMES = ['manifest.yml', 'manifest.yaml', 'manifest.json'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const JOB_TYPES = new Set(['single', 'merge']);
const SORT_MODES = new Set(['manifest', 'filename']);

export function dateParts(date) {
  if (!DATE_RE.test(date)) {
    throw new Error(`date must use YYYY-MM-DD format: ${date}`);
  }
  return {
    year: date.slice(0, 4),
    month: date.slice(5, 7),
    day: date
  };
}

export function inferDateFromManifestPath(manifestPath, projectRoot = process.cwd()) {
  const rel = toPosix(path.relative(projectRoot, path.resolve(manifestPath)));
  const match = rel.match(/^inbox\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\/(manifest\.(?:ya?ml|json))$/i);
  if (!match) return null;
  return {
    year: match[1],
    month: match[2],
    day: match[3],
    rootRel: `inbox/${match[1]}/${match[2]}/${match[3]}`
  };
}

export async function findManifestInDayDir(dayDir) {
  for (const name of MANIFEST_FILENAMES) {
    const candidate = path.join(dayDir, name);
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

export async function resolveManifestTarget(target, projectRoot = process.cwd()) {
  if (!target || typeof target !== 'string') {
    throw new Error('Please provide a manifest path or a day like 2026-07-02.');
  }

  const normalized = target.trim();
  if (DATE_RE.test(normalized)) {
    const { year, month, day } = dateParts(normalized);
    const dayDir = path.resolve(projectRoot, INBOX_DIR, year, month, day);
    const manifestPath = await findManifestInDayDir(dayDir);
    if (!manifestPath) {
      throw new Error(`No manifest found in ${path.relative(projectRoot, dayDir)}.`);
    }
    return manifestPath;
  }

  const rel = assertSafeRelativePath(normalized, 'manifest path');
  const manifestPath = path.resolve(projectRoot, rel);
  if (!(await pathExists(manifestPath))) {
    throw new Error(`Manifest does not exist: ${rel}`);
  }
  if (!/manifest\.(ya?ml|json)$/i.test(path.basename(manifestPath))) {
    throw new Error(`Manifest file name must be manifest.yml, manifest.yaml, or manifest.json: ${rel}`);
  }
  return manifestPath;
}

function parseManifest(text, manifestPath) {
  const ext = path.extname(manifestPath).toLowerCase();
  if (ext === '.json') return JSON.parse(text);
  return yaml.load(text, { filename: manifestPath });
}

function validateOutputPath(value, label) {
  const output = assertSafeRelativePath(value, label);
  if (!/\.pdf$/i.test(output)) {
    throw new Error(`${label} must end with .pdf: ${value}`);
  }
  return output;
}

function validateOutputDir(value, label) {
  return assertSafeRelativePath(value, label);
}

function normalizeInputs(value, label) {
  if (value === 'all') return 'all';
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}.inputs must be 'all' or a non-empty array.`);
  }
  return value.map((item, index) => assertSafeRelativePath(item, `${label}.inputs[${index}]`));
}

function normalizeJob(rawJob, index) {
  const label = `jobs[${index}]`;
  if (!isPlainObject(rawJob)) {
    throw new Error(`${label} must be an object.`);
  }

  const id = String(rawJob.id ?? '').trim();
  if (!JOB_ID_RE.test(id)) {
    throw new Error(`${label}.id must start with a letter/number and contain only letters, numbers, dots, underscores, or hyphens.`);
  }

  const type = String(rawJob.type ?? '').trim();
  if (!JOB_TYPES.has(type)) {
    throw new Error(`${label}.type must be one of: single, merge.`);
  }

  const sort = rawJob.sort == null ? (rawJob.inputs === 'all' ? 'filename' : 'manifest') : String(rawJob.sort).trim();
  if (!SORT_MODES.has(sort)) {
    throw new Error(`${label}.sort must be one of: manifest, filename.`);
  }

  const job = {
    id,
    type,
    title: rawJob.title == null ? '' : String(rawJob.title).trim(),
    enabled: rawJob.enabled !== false,
    inputs: normalizeInputs(rawJob.inputs, label),
    sort,
    page_break: rawJob.page_break !== false,
    add_title: rawJob.add_title !== false
  };

  if (rawJob.output != null) {
    job.output = validateOutputPath(rawJob.output, `${label}.output`);
  }

  if (rawJob.output_dir != null) {
    job.output_dir = validateOutputDir(rawJob.output_dir, `${label}.output_dir`);
  }

  if (type === 'merge' && job.output_dir) {
    throw new Error(`${label}.output_dir is only valid for type: single.`);
  }

  return job;
}

export async function loadManifest(manifestPath, projectRoot = process.cwd()) {
  const absoluteManifestPath = path.resolve(projectRoot, manifestPath);
  const manifestRoot = path.dirname(absoluteManifestPath);
  const text = await fs.readFile(absoluteManifestPath, 'utf8');
  const raw = parseManifest(text, absoluteManifestPath);

  if (!isPlainObject(raw)) {
    throw new Error(`Manifest must be an object: ${path.relative(projectRoot, absoluteManifestPath)}`);
  }

  if (Number(raw.version) !== 1) {
    throw new Error('manifest.version must be 1.');
  }

  const inferred = inferDateFromManifestPath(absoluteManifestPath, projectRoot);
  const date = raw.date == null ? inferred?.day : String(raw.date).trim();
  if (!DATE_RE.test(date || '')) {
    throw new Error('manifest.date must use YYYY-MM-DD format, or the manifest must live under inbox/YYYY/MM/YYYY-MM-DD/.');
  }

  const parts = dateParts(date);
  if (inferred && inferred.day !== date) {
    throw new Error(`manifest.date (${date}) must match its folder date (${inferred.day}).`);
  }
  if (inferred && (inferred.year !== parts.year || inferred.month !== parts.month)) {
    throw new Error(`manifest folder must match date year/month: ${date}.`);
  }

  if (!Array.isArray(raw.jobs) || raw.jobs.length === 0) {
    throw new Error('manifest.jobs must be a non-empty array.');
  }

  const jobs = raw.jobs.map(normalizeJob).filter((job) => job.enabled);
  if (jobs.length === 0) {
    throw new Error('manifest.jobs has no enabled jobs.');
  }

  const seenIds = new Set();
  for (const job of jobs) {
    if (seenIds.has(job.id)) {
      throw new Error(`Duplicate job id: ${job.id}`);
    }
    seenIds.add(job.id);
  }

  const consume = isPlainObject(raw.consume) ? raw.consume : {};

  return {
    version: 1,
    title: raw.title == null ? '' : String(raw.title).trim(),
    date,
    ...parts,
    manifestPath: absoluteManifestPath,
    manifestRel: toPosix(path.relative(projectRoot, absoluteManifestPath)),
    rootDir: manifestRoot,
    rootRel: toPosix(path.relative(projectRoot, manifestRoot)),
    jobs,
    consume: {
      delete_after_success: consume.delete_after_success === true
    }
  };
}

export async function resolveJobInputs(manifest, job) {
  let files;

  if (job.inputs === 'all') {
    const mdDir = path.join(manifest.rootDir, 'md');
    if (!(await pathExists(mdDir))) {
      throw new Error(`${manifest.rootRel}/md does not exist, but ${job.id}.inputs is all.`);
    }
    files = await listMarkdownFiles(mdDir);
  } else {
    files = job.inputs.map((input) => ensureInside(manifest.rootDir, path.resolve(manifest.rootDir, input), `${job.id}.inputs`));
    for (const file of files) {
      if (!/\.md$/i.test(file)) {
        throw new Error(`${job.id}.inputs only supports Markdown files: ${path.relative(manifest.rootDir, file)}`);
      }
      if (!(await pathExists(file))) {
        throw new Error(`${job.id}.inputs file does not exist: ${path.relative(manifest.rootDir, file)}`);
      }
    }
  }

  if (job.sort === 'filename') {
    files = files.slice().sort((a, b) => toPosix(path.basename(a)).localeCompare(toPosix(path.basename(b)), 'zh-Hans-CN'));
  }

  if (files.length === 0) {
    throw new Error(`${job.id} matched no Markdown inputs.`);
  }

  return files;
}

export function outputBaseForManifest(manifest, projectRoot = process.cwd()) {
  return path.resolve(projectRoot, 'dist', 'queue', manifest.year, manifest.month, manifest.day);
}

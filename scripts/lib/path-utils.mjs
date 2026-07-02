import fs from 'node:fs/promises';
import path from 'node:path';

export function toPosix(value) {
  return String(value).replace(/\\/g, '/');
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasUriScheme(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(value));
}

export function isRelativeResource(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('<')) return false;
  if (hasUriScheme(raw)) return false;
  return true;
}

export function assertSafeRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }

  const normalized = toPosix(value.trim());
  if (path.isAbsolute(normalized) || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error(`${label} must be a safe relative path: ${value}`);
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..')) {
    throw new Error(`${label} must not contain '..': ${value}`);
  }

  return normalized;
}

export function ensureInside(parent, child, label = 'path') {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);
  const relative = path.relative(parentPath, childPath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return childPath;
  }
  throw new Error(`${label} escapes its allowed directory: ${child}`);
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.md$/i.test(entry.name)) continue;
    files.push(path.join(dir, entry.name));
  }

  return files.sort((a, b) => toPosix(a).localeCompare(toPosix(b), 'zh-Hans-CN'));
}

function splitUrlSuffix(rawUrl) {
  const match = String(rawUrl).match(/^([^?#]*)([?#].*)?$/);
  return {
    pathname: match?.[1] ?? rawUrl,
    suffix: match?.[2] ?? ''
  };
}

function rewriteResourceUrl(rawUrl, fromMarkdownPath, toMarkdownPath) {
  const trimmed = String(rawUrl || '').trim();
  if (!isRelativeResource(trimmed)) return rawUrl;

  const { pathname, suffix } = splitUrlSuffix(trimmed);
  if (!pathname || !isRelativeResource(pathname)) return rawUrl;

  const absoluteTarget = path.resolve(path.dirname(fromMarkdownPath), pathname);
  const targetDir = path.dirname(toMarkdownPath);
  const relativeTarget = toPosix(path.relative(targetDir, absoluteTarget));
  return `${relativeTarget || path.basename(absoluteTarget)}${suffix}`;
}

export function rewriteMarkdownResourcePaths(markdown, fromMarkdownPath, toMarkdownPath) {
  const chunks = String(markdown).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);

  return chunks.map((chunk) => {
    if (/^```|^~~~|^`/.test(chunk)) return chunk;

    return chunk
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
        const rewritten = rewriteResourceUrl(url, fromMarkdownPath, toMarkdownPath);
        return `![${alt}](${rewritten})`;
      })
      .replace(/!\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (full, target, alias = '') => {
        const rewritten = rewriteResourceUrl(target, fromMarkdownPath, toMarkdownPath);
        return `![[${rewritten}${alias}]]`;
      })
      .replace(/(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (full, prefix, url, suffix) => {
        const rewritten = rewriteResourceUrl(url, fromMarkdownPath, toMarkdownPath);
        return `${prefix}${rewritten}${suffix}`;
      });
  }).join('');
}

export async function removeEmptyParents(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);

  while (current.startsWith(stop) && current !== stop) {
    try {
      const entries = await fs.readdir(current);
      if (entries.length > 0) return;
      await fs.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

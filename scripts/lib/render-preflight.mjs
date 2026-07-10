import fs from 'node:fs/promises';
import path from 'node:path';
import katex from 'katex';
import { isRelativeResource, toPosix } from './path-utils.mjs';

function splitProtectedMarkdown(markdown) {
  return String(markdown).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
}

function cleanMarkdownUrl(rawUrl) {
  let value = String(rawUrl || '').trim();
  if (!value) return '';

  if (value.startsWith('<')) {
    const end = value.indexOf('>');
    if (end > 0) return value.slice(1, end).trim();
  }

  const titleMatch = value.match(/^(\S+)(?:\s+["'(].*)?$/);
  return (titleMatch?.[1] || value).trim();
}

function removeUrlSuffix(value) {
  return String(value).replace(/[?#].*$/, '');
}

function decodePathname(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collectResourceReferences(markdown) {
  const references = [];
  const chunks = splitProtectedMarkdown(markdown);

  for (const chunk of chunks) {
    if (/^```|^~~~|^`/.test(chunk)) continue;

    for (const match of chunk.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      references.push({ kind: 'markdown image', value: cleanMarkdownUrl(match[1]) });
    }

    for (const match of chunk.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      references.push({ kind: 'Obsidian image', value: String(match[1] || '').trim() });
    }

    for (const match of chunk.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      references.push({ kind: 'HTML image', value: String(match[1] || '').trim() });
    }
  }

  return references;
}

function collectMathExpressions(markdown) {
  const expressions = [];
  const chunks = String(markdown).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);

  for (const chunk of chunks) {
    if (/^```|^~~~/.test(chunk)) continue;

    const inlineChunks = chunk.split(/(`[^`\n]*`)/g);
    for (const inlineChunk of inlineChunks) {
      if (/^`/.test(inlineChunk)) continue;

      let remaining = inlineChunk;
      remaining = remaining.replace(/\\\[([\s\S]*?)\\\]/g, (_, source) => {
        expressions.push({ displayMode: true, source });
        return '';
      });
      remaining = remaining.replace(/\$\$([\s\S]*?)\$\$/g, (_, source) => {
        expressions.push({ displayMode: true, source });
        return '';
      });
      remaining = remaining.replace(/\\\(([\s\S]*?)\\\)/g, (_, source) => {
        expressions.push({ displayMode: false, source });
        return '';
      });

      for (const match of remaining.matchAll(/(^|[^\\])\$(?!\$)([^$\n]+?)(?<!\\)\$/g)) {
        expressions.push({ displayMode: false, source: match[2] });
      }
    }
  }

  return expressions;
}

async function validateResources(markdown, markdownPath) {
  const failures = [];
  const seen = new Set();

  for (const reference of collectResourceReferences(markdown)) {
    const raw = reference.value;
    if (!raw || !isRelativeResource(raw)) continue;

    const pathname = decodePathname(removeUrlSuffix(raw));
    if (!pathname || seen.has(pathname)) continue;
    seen.add(pathname);

    const absolute = path.resolve(path.dirname(markdownPath), pathname);
    try {
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) {
        failures.push(`${reference.kind} is not a file: ${raw}`);
      }
    } catch {
      failures.push(`${reference.kind} does not exist: ${raw}`);
    }
  }

  return failures;
}

function validateMath(markdown) {
  const failures = [];

  for (const [index, expression] of collectMathExpressions(markdown).entries()) {
    const source = String(expression.source || '').trim();
    if (!source) {
      failures.push(`math expression #${index + 1} is empty`);
      continue;
    }

    try {
      katex.renderToString(source, {
        displayMode: expression.displayMode,
        throwOnError: true,
        strict: false,
        output: 'htmlAndMathml'
      });
    } catch (error) {
      const preview = source.replace(/\s+/g, ' ').slice(0, 160);
      failures.push(`KaTeX expression #${index + 1} failed: ${preview}\n  ${error?.message || error}`);
    }
  }

  return failures;
}

export async function validateMarkdownForRender(markdownPath, projectRoot = process.cwd()) {
  const absolute = path.resolve(projectRoot, markdownPath);
  const markdown = await fs.readFile(absolute, 'utf8');

  const failures = [
    ...(await validateResources(markdown, absolute)),
    ...validateMath(markdown)
  ];

  if (failures.length > 0) {
    const relative = toPosix(path.relative(projectRoot, absolute));
    throw new Error(`Render preflight failed for ${relative}:\n- ${failures.join('\n- ')}`);
  }

  const relative = toPosix(path.relative(projectRoot, absolute));
  console.log(`Render preflight OK: ${relative}`);
}

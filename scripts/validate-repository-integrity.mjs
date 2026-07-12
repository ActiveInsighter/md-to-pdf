import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_PATHS = [
  '.github/workflows/build-pdf-api.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/repository-hygiene.yml',
  '.github/workflows/validate-renderer.yml',
  'AGENTS.md',
  'README.md',
  'docs/cloudflare-pages-actions-deploy.md',
  'docs/supabase-pdf-service.md',
  'fixtures/inline-image.svg',
  'fixtures/render-regression.md',
  'frontend/package-lock.json',
  'frontend/package.json',
  'package-lock.json',
  'package.json',
  'scripts/build-pdf.mjs',
  'scripts/cleanup-supabase-pdf-jobs.mjs',
  'scripts/prepare-supabase-input.py',
  'scripts/supabase-pdf-job.mjs',
  'scripts/test-render.mjs',
  'supabase/config.toml',
  'themes/chatgpt-light.css',
]

const MARKDOWN_ROOTS = ['README.md', 'docs']

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function stripFencedCode(source) {
  return source.replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3(?=\n|$)/g, '$1')
}

function extractLinkTargets(source) {
  const content = stripFencedCode(source)
  const targets = []
  const inlineLink = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g
  const referenceLink = /^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm
  const htmlLink = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi

  for (const match of content.matchAll(inlineLink)) targets.push(match[1])
  for (const match of content.matchAll(referenceLink)) targets.push(match[1])
  for (const match of content.matchAll(htmlLink)) targets.push(match[1])
  return targets
}

function normalizeLocalTarget(rawTarget) {
  let target = rawTarget.trim()
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
  if (!target || target.startsWith('#') || target.startsWith('/')) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) return null

  target = target.split('#', 1)[0].split('?', 1)[0]
  if (!target) return null

  try {
    return decodeURIComponent(target)
  } catch {
    return target
  }
}

async function collectMarkdownFiles(root, entries = MARKDOWN_ROOTS) {
  const files = []

  async function visit(relativePath) {
    const absolutePath = path.resolve(root, relativePath)
    let metadata
    try {
      metadata = await stat(absolutePath)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }

    if (metadata.isDirectory()) {
      const children = await readdir(absolutePath, { withFileTypes: true })
      for (const child of children) {
        if (child.name.startsWith('.')) continue
        await visit(path.join(relativePath, child.name))
      }
      return
    }

    if (metadata.isFile() && relativePath.toLowerCase().endsWith('.md')) {
      files.push(toPosix(relativePath))
    }
  }

  for (const entry of entries) await visit(entry)
  return files.sort()
}

async function pathExists(target) {
  try {
    await access(target)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function validateRepositoryIntegrity({
  root = process.cwd(),
  requiredPaths = REQUIRED_PATHS,
  markdownRoots = MARKDOWN_ROOTS,
} = {}) {
  const resolvedRoot = path.resolve(root)
  const errors = []

  for (const requiredPath of requiredPaths) {
    if (!(await pathExists(path.resolve(resolvedRoot, requiredPath)))) {
      errors.push(`Missing required repository path: ${toPosix(requiredPath)}`)
    }
  }

  const markdownFiles = await collectMarkdownFiles(resolvedRoot, markdownRoots)
  for (const markdownFile of markdownFiles) {
    const markdownPath = path.resolve(resolvedRoot, markdownFile)
    const source = await readFile(markdownPath, 'utf8')

    for (const rawTarget of extractLinkTargets(source)) {
      const target = normalizeLocalTarget(rawTarget)
      if (!target) continue

      const absoluteTarget = path.resolve(path.dirname(markdownPath), target)
      const relativeTarget = path.relative(resolvedRoot, absoluteTarget)
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        errors.push(`${markdownFile}: local link escapes repository root: ${rawTarget}`)
        continue
      }

      if (!(await pathExists(absoluteTarget))) {
        errors.push(`${markdownFile}: broken local link: ${rawTarget}`)
      }
    }
  }

  return [...new Set(errors)].sort()
}

async function main() {
  const errors = await validateRepositoryIntegrity()
  if (errors.length > 0) {
    console.error('Repository integrity validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log(`Validated ${REQUIRED_PATHS.length} required paths and local Markdown links.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW_PATH = '.github/workflows/validate-renderer.yml'
const SCRIPT_ENTRYPOINTS = [
  'scripts/test-render.mjs',
  'scripts/build-pdf.mjs',
  'scripts/postprocess-pdfs.mjs',
]
const STATIC_TRIGGER_PATHS = [
  'themes/**',
  'style.css',
  'fixtures/**',
  'package.json',
  'package-lock.json',
  '.github/workflows/build-pdf-api.yml',
  WORKFLOW_PATH,
]

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function unquote(value) {
  const trimmed = value.trim().replace(/\s+#.*$/, '')
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function blockEnd(lines, start, parentIndent) {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && indentation(lines[index]) <= parentIndent) return index
  }
  return lines.length
}

export function extractEventPaths(source, eventName) {
  const lines = source.split(/\r?\n/)
  const onIndex = lines.findIndex((line) => /^on:\s*(?:#.*)?$/.test(line))
  if (onIndex === -1) return []

  const onEnd = blockEnd(lines, onIndex, 0)
  const eventPattern = new RegExp(`^  ${eventName}:\\s*(?:#.*)?$`)
  const eventIndex = lines.findIndex(
    (line, index) => index > onIndex && index < onEnd && eventPattern.test(line),
  )
  if (eventIndex === -1) return []

  const eventEnd = blockEnd(lines, eventIndex, 2)
  const pathsIndex = lines.findIndex(
    (line, index) => index > eventIndex && index < eventEnd && /^    paths:\s*(?:#.*)?$/.test(line),
  )
  if (pathsIndex === -1) return []

  const pathsEnd = blockEnd(lines, pathsIndex, 4)
  const paths = []
  for (let index = pathsIndex + 1; index < pathsEnd; index += 1) {
    const match = lines[index].match(/^      -\s+(.+)$/)
    if (match) paths.push(unquote(match[1]))
  }
  return paths
}

function localImports(source) {
  const imports = []
  const pattern = /(?:import|export)\s+(?:[^'"\n]*?\sfrom\s*)?['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[1].startsWith('./') || match[1].startsWith('../')) imports.push(match[1])
  }
  return imports
}

async function resolveLocalImport(parentFile, specifier, root) {
  const base = path.resolve(path.dirname(parentFile), specifier)
  const candidates = [base, `${base}.mjs`, `${base}.js`, path.join(base, 'index.mjs')]
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      const relative = path.relative(root, candidate)
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Renderer import escapes repository root: ${specifier}`)
      }
      return candidate
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error(`Unable to resolve renderer import ${specifier} from ${toPosix(path.relative(root, parentFile))}`)
}

export async function collectRendererScriptDependencies(root = process.cwd()) {
  const resolvedRoot = path.resolve(root)
  const pending = SCRIPT_ENTRYPOINTS.map((entry) => path.resolve(resolvedRoot, entry))
  const visited = new Set()

  while (pending.length > 0) {
    const file = pending.pop()
    const relative = toPosix(path.relative(resolvedRoot, file))
    if (visited.has(relative)) continue

    const source = await readFile(file, 'utf8')
    visited.add(relative)
    for (const specifier of localImports(source)) {
      const dependency = await resolveLocalImport(file, specifier, resolvedRoot)
      const dependencyRelative = toPosix(path.relative(resolvedRoot, dependency))
      if (!visited.has(dependencyRelative)) pending.push(dependency)
    }
  }

  return [...visited].sort()
}

function comparePathSets(actual, expected, label) {
  const errors = []
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)

  if (actual.length !== actualSet.size) errors.push(`${label} paths must not contain duplicates`)
  for (const required of expectedSet) {
    if (!actualSet.has(required)) errors.push(`${label} paths are missing ${required}`)
  }
  for (const configured of actualSet) {
    if (!expectedSet.has(configured)) errors.push(`${label} paths contain unrelated trigger ${configured}`)
  }
  return errors
}

export async function validateRendererWorkflowPaths({
  root = process.cwd(),
  workflowPath = WORKFLOW_PATH,
} = {}) {
  const resolvedRoot = path.resolve(root)
  const source = await readFile(path.resolve(resolvedRoot, workflowPath), 'utf8')
  const scriptDependencies = await collectRendererScriptDependencies(resolvedRoot)
  const expected = [...scriptDependencies, ...STATIC_TRIGGER_PATHS]
  const errors = []

  if (source.includes("'scripts/**'") || source.includes('"scripts/**"')) {
    errors.push(`${workflowPath}: renderer workflow must not use the broad scripts/** trigger`)
  }
  errors.push(...comparePathSets(extractEventPaths(source, 'push'), expected, `${workflowPath} push`))
  errors.push(...comparePathSets(extractEventPaths(source, 'pull_request'), expected, `${workflowPath} pull_request`))
  return errors
}

async function main() {
  const errors = await validateRendererWorkflowPaths()
  if (errors.length > 0) {
    console.error('Renderer workflow path validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const dependencies = await collectRendererScriptDependencies()
  console.log(`Validated renderer workflow paths for ${dependencies.length} script dependencies.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

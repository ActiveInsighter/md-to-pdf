import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractEventPaths } from './validate-workflow-renderer-paths.mjs'

const WORKFLOW_PATH = '.github/workflows/validate-functions.yml'
const FUNCTIONS_ROOT = 'supabase/functions'
const REQUIRED_PULL_REQUEST_PATHS = [
  WORKFLOW_PATH,
  'package.json',
  'package-lock.json',
  'supabase/config.toml',
  'supabase/functions/**',
  'supabase/migrations/**',
]
const REQUIRED_COMMANDS = [
  'run: npm ci --no-audit --no-fund',
  'run: npm run test:functions',
  'run: npm run check:functions',
]

function toPosix(value) {
  return value.split(path.sep).join('/')
}

export function extractDeclaredFunctions(source) {
  const match = source.match(/^\s+functions=\(\s*$([\s\S]*?)^\s+\)\s*$/m)
  if (!match) return []

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+#.*$/, ''))
    .filter(Boolean)
}

export async function discoverEdgeFunctions(root = process.cwd()) {
  const functionsPath = path.resolve(root, FUNCTIONS_ROOT)
  const entries = await readdir(functionsPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name)
    .sort()
}

export async function validateFunctionsWorkflow({
  root = process.cwd(),
  workflowPath = WORKFLOW_PATH,
} = {}) {
  const resolvedRoot = path.resolve(root)
  const source = await readFile(path.resolve(resolvedRoot, workflowPath), 'utf8')
  const errors = []
  const pullRequestPaths = extractEventPaths(source, 'pull_request')
  const declaredFunctions = extractDeclaredFunctions(source)
  const discoveredFunctions = await discoverEdgeFunctions(resolvedRoot)
  const declaredSet = new Set(declaredFunctions)
  const discoveredSet = new Set(discoveredFunctions)

  for (const requiredPath of REQUIRED_PULL_REQUEST_PATHS) {
    if (!pullRequestPaths.includes(requiredPath)) {
      errors.push(`${workflowPath}: pull_request paths are missing ${requiredPath}`)
    }
  }

  for (const requiredCommand of REQUIRED_COMMANDS) {
    if (!source.includes(requiredCommand)) {
      errors.push(`${workflowPath}: missing required command ${requiredCommand.replace('run: ', '')}`)
    }
  }

  for (const configuredPath of pullRequestPaths) {
    if (configuredPath.startsWith('supabase/migrations/') && configuredPath !== 'supabase/migrations/**') {
      errors.push(`${workflowPath}: migration validation must use supabase/migrations/** instead of ${configuredPath}`)
    }
  }

  if (declaredFunctions.length !== declaredSet.size) {
    errors.push(`${workflowPath}: Edge Function list must not contain duplicates`)
  }
  for (const functionName of discoveredSet) {
    if (!declaredSet.has(functionName)) {
      errors.push(`${workflowPath}: Edge Function list is missing ${functionName}`)
    }
  }
  for (const functionName of declaredSet) {
    if (!discoveredSet.has(functionName)) {
      errors.push(`${workflowPath}: Edge Function list contains unknown function ${functionName}`)
    }
  }

  return [...new Set(errors)].sort()
}

async function main() {
  const errors = await validateFunctionsWorkflow()
  if (errors.length > 0) {
    console.error('Supabase Functions workflow validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const functions = await discoverEdgeFunctions()
  console.log(`Validated ${toPosix(WORKFLOW_PATH)} coverage for ${functions.length} Edge Functions.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

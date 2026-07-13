import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const NON_CANCELABLE_WORKFLOWS = new Map([
  ['.github/workflows/build-pdf-api.yml', 'pdf-api-${{ inputs.job_id }}'],
  ['.github/workflows/cleanup-branches.yml', 'branch-cleanup-${{ github.repository }}'],
  ['.github/workflows/cleanup-supabase-pdf-jobs.yml', 'cleanup-supabase-pdf-jobs'],
  ['.github/workflows/smoke-supabase-service.yml', 'supabase-pdf-service-smoke'],
])
const UNIQUE_GROUP_CONTEXT_RE = /github\.(?:run_id|run_attempt|sha)|github\.event\.(?:after|before)|github\.event\.pull_request\.(?:head|base)\.sha/

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function concurrencyRange(lines) {
  const indexes = []
  for (let index = 0; index < lines.length; index += 1) {
    if (/^concurrency:\s*(?:#.*)?$/.test(lines[index])) indexes.push(index)
  }

  if (indexes.length !== 1) return { indexes, start: -1, end: -1 }

  const start = indexes[0]
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && indentation(lines[index]) === 0) {
      end = index
      break
    }
  }
  return { indexes, start, end }
}

function propertyEntries(lines, start, end, property) {
  const entries = []
  const pattern = new RegExp(`^  ${property}:\\s*(.*)$`)
  for (let index = start + 1; index < end; index += 1) {
    const match = lines[index].match(pattern)
    if (match) entries.push({ value: match[1].replace(/\s+#.*$/, '').trim(), lineNumber: index + 1 })
  }
  return entries
}

export function validateWorkflowConcurrency(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const errors = []
  const range = concurrencyRange(lines)

  if (range.indexes.length === 0) {
    return [`${normalizedPath}: workflow must declare top-level concurrency`]
  }
  if (range.indexes.length > 1) {
    return [`${normalizedPath}: workflow declares top-level concurrency more than once`]
  }

  const groups = propertyEntries(lines, range.start, range.end, 'group')
  const cancelValues = propertyEntries(lines, range.start, range.end, 'cancel-in-progress')

  if (groups.length !== 1) {
    errors.push(`${normalizedPath}:${range.start + 1}: concurrency must declare exactly one group`)
  }
  if (cancelValues.length !== 1) {
    errors.push(`${normalizedPath}:${range.start + 1}: concurrency must declare exactly one cancel-in-progress value`)
  }
  if (errors.length > 0) return errors

  const group = groups[0]
  const cancel = cancelValues[0]
  if (!group.value) {
    errors.push(`${normalizedPath}:${group.lineNumber}: concurrency group must not be empty`)
  } else if (UNIQUE_GROUP_CONTEXT_RE.test(group.value)) {
    errors.push(`${normalizedPath}:${group.lineNumber}: concurrency group must not use per-run or per-commit identifiers that defeat deduplication`)
  }

  if (cancel.value !== 'true' && cancel.value !== 'false') {
    errors.push(`${normalizedPath}:${cancel.lineNumber}: cancel-in-progress must be the literal true or false`)
    return errors
  }

  const expectedGroup = NON_CANCELABLE_WORKFLOWS.get(normalizedPath)
  if (expectedGroup !== undefined) {
    if (cancel.value !== 'false') {
      errors.push(`${normalizedPath}:${cancel.lineNumber}: transactional workflow must use cancel-in-progress: false`)
    }
    if (group.value !== expectedGroup) {
      errors.push(`${normalizedPath}:${group.lineNumber}: transactional workflow must use concurrency group ${expectedGroup}`)
    }
  } else if (cancel.value !== 'true') {
    errors.push(`${normalizedPath}:${cancel.lineNumber}: replaceable validation or deployment workflow must use cancel-in-progress: true`)
  }

  return errors
}

export async function validateWorkflowConcurrencyDirectory(directory = WORKFLOW_DIR) {
  const files = await discoverWorkflowFiles(directory)
  if (files.length === 0) return [`${workflowPath(directory)}: no workflow files found`]

  const errors = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    errors.push(...validateWorkflowConcurrency(source, workflowPath(file)))
  }
  return errors
}

async function main() {
  const errors = await validateWorkflowConcurrencyDirectory()
  if (errors.length > 0) {
    console.error('Workflow concurrency validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const files = await discoverWorkflowFiles()
  console.log(`Validated concurrency policies in ${files.length} workflow files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const MAX_TIMEOUT_MINUTES = 60

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function jobHeaders(lines) {
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line))
  if (jobsIndex === -1) return []

  const headers = []
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() && indentation(line) === 0) break

    const match = line.match(/^  ([A-Za-z0-9_.-]+):\s*(?:#.*)?$/)
    if (match) headers.push({ name: match[1], index })
  }
  return headers
}

function jobRange(lines, headers, headerIndex) {
  const start = headers[headerIndex].index + 1
  const end = headerIndex + 1 < headers.length ? headers[headerIndex + 1].index : lines.length
  return lines.slice(start, end)
}

export function validateWorkflowTimeouts(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const headers = jobHeaders(lines)
  const errors = []

  headers.forEach((header, headerIndex) => {
    const body = jobRange(lines, headers, headerIndex)
    const hasRunner = body.some((line) => /^    runs-on:\s*\S+/.test(line))
    if (!hasRunner) return

    const timeoutLines = body
      .map((line, offset) => ({ line, lineNumber: header.index + offset + 2 }))
      .filter(({ line }) => /^    timeout-minutes:\s*/.test(line))

    if (timeoutLines.length === 0) {
      errors.push(`${normalizedPath}:${header.index + 1}: job ${header.name} must declare timeout-minutes`)
      return
    }

    if (timeoutLines.length > 1) {
      errors.push(`${normalizedPath}:${header.index + 1}: job ${header.name} declares timeout-minutes more than once`)
      return
    }

    const { line, lineNumber } = timeoutLines[0]
    const value = line.replace(/^    timeout-minutes:\s*/, '').replace(/\s+#.*$/, '').trim()
    if (!/^\d+$/.test(value)) {
      errors.push(`${normalizedPath}:${lineNumber}: job ${header.name} timeout-minutes must be an integer from 1 to ${MAX_TIMEOUT_MINUTES}`)
      return
    }

    const minutes = Number(value)
    if (minutes < 1 || minutes > MAX_TIMEOUT_MINUTES) {
      errors.push(`${normalizedPath}:${lineNumber}: job ${header.name} timeout-minutes must be between 1 and ${MAX_TIMEOUT_MINUTES}`)
    }
  })

  return errors
}

export async function validateWorkflowTimeoutDirectory(directory = WORKFLOW_DIR) {
  const files = await discoverWorkflowFiles(directory)
  if (files.length === 0) return [`${workflowPath(directory)}: no workflow files found`]

  const errors = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    errors.push(...validateWorkflowTimeouts(source, workflowPath(file)))
  }
  return errors
}

async function main() {
  const errors = await validateWorkflowTimeoutDirectory()
  if (errors.length > 0) {
    console.error('Workflow timeout validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const files = await discoverWorkflowFiles()
  console.log(`Validated job timeouts in ${files.length} workflow files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const ALLOWED_STEPS = new Map([
  [
    '.github/workflows/build-pdf-api.yml',
    new Map([
      ['Delete source objects after success', {}],
      ['Upload one-day debug artifact', { condition: 'always()' }],
      ['Mark failed', { condition: 'failure()' }],
    ]),
  ],
])

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function unquote(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function propertyEntries(lines, start, end, propertyIndent, property) {
  const entries = []
  const pattern = new RegExp(`^\\s{${propertyIndent}}${property}:\\s*(.*)$`)
  for (let index = start; index < end; index += 1) {
    const match = lines[index].match(pattern)
    if (match) {
      entries.push({
        value: unquote(match[1].replace(/\s+#.*$/, '')),
        lineNumber: index + 1,
      })
    }
  }
  return entries
}

function collectSteps(lines) {
  const steps = []

  for (let stepsIndex = 0; stepsIndex < lines.length; stepsIndex += 1) {
    const stepsMatch = lines[stepsIndex].match(/^(\s*)steps:\s*(?:#.*)?$/)
    if (!stepsMatch) continue

    const stepsIndent = stepsMatch[1].length
    const itemIndent = stepsIndent + 2
    let blockEnd = lines.length
    for (let index = stepsIndex + 1; index < lines.length; index += 1) {
      if (lines[index].trim() && indentation(lines[index]) <= stepsIndent) {
        blockEnd = index
        break
      }
    }

    const starts = []
    for (let index = stepsIndex + 1; index < blockEnd; index += 1) {
      if (indentation(lines[index]) === itemIndent && /^\s*-\s+/.test(lines[index])) {
        starts.push(index)
      }
    }

    starts.forEach((start, position) => {
      const end = position + 1 < starts.length ? starts[position + 1] : blockEnd
      const propertyIndent = itemIndent + 2
      const headerName = lines[start].match(/^\s*-\s+name:\s*(.*)$/)?.[1]
      const nestedNames = propertyEntries(lines, start + 1, end, propertyIndent, 'name')
      const name = headerName !== undefined
        ? unquote(headerName.replace(/\s+#.*$/, ''))
        : nestedNames[0]?.value ?? null

      steps.push({
        name,
        start,
        end,
        propertyIndent,
        text: lines.slice(start, end).join('\n'),
      })
    })

    stepsIndex = blockEnd - 1
  }

  return steps
}

export function validateContinueOnError(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const steps = collectSteps(lines)
  const allowed = ALLOWED_STEPS.get(normalizedPath) ?? new Map()
  const errors = []
  const scopedLines = new Set()

  for (const step of steps) {
    const entries = propertyEntries(lines, step.start, step.end, step.propertyIndent, 'continue-on-error')
    for (const entry of entries) scopedLines.add(entry.lineNumber)
    if (entries.length === 0) continue

    if (entries.length > 1) {
      errors.push(`${normalizedPath}:${step.start + 1}: step ${step.name ?? '<unnamed>'} declares continue-on-error more than once`)
      continue
    }

    const entry = entries[0]
    if (entry.value !== 'true') {
      errors.push(`${normalizedPath}:${entry.lineNumber}: continue-on-error must be the literal true or be omitted`)
      continue
    }

    if (!step.name) {
      errors.push(`${normalizedPath}:${step.start + 1}: unnamed steps must not use continue-on-error`)
      continue
    }

    const policy = allowed.get(step.name)
    if (!policy) {
      errors.push(`${normalizedPath}:${entry.lineNumber}: continue-on-error is not approved for step ${step.name}`)
      continue
    }

    if (policy.condition) {
      const conditions = propertyEntries(lines, step.start, step.end, step.propertyIndent, 'if')
      if (conditions.length !== 1 || conditions[0].value !== policy.condition) {
        errors.push(`${normalizedPath}:${step.start + 1}: ${step.name} must use if: ${policy.condition}`)
      }
    }

  }

  lines.forEach((line, index) => {
    if (/^\s*continue-on-error:\s*/.test(line) && !scopedLines.has(index + 1)) {
      errors.push(`${normalizedPath}:${index + 1}: continue-on-error must be scoped to a named approved step`)
    }
  })

  return errors
}

export async function validateContinueOnErrorDirectory(directory = WORKFLOW_DIR) {
  const files = await discoverWorkflowFiles(directory)
  if (files.length === 0) return [`${workflowPath(directory)}: no workflow files found`]

  const errors = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    errors.push(...validateContinueOnError(source, workflowPath(file)))
  }
  return errors
}

async function main() {
  const errors = await validateContinueOnErrorDirectory()
  if (errors.length > 0) {
    console.error('Workflow continue-on-error validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const files = await discoverWorkflowFiles()
  console.log(`Validated continue-on-error policies in ${files.length} workflow files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const BLOCK_SCALAR_RE = /^[|>][+-]?(?:[1-9])?\s*(?:#.*)?$/
const RUN_EXPRESSION_RE = /\$\{\{\s*([^}]+?)\s*\}\}/
const STRICT_BASH_RE = /^set\s+-E?euo\s+pipefail(?:\s+#.*)?$/

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function validateRunText(text, relativePath, lineNumber, errors) {
  const match = text.match(RUN_EXPRESSION_RE)
  if (!match) return

  errors.push(
    `${relativePath}:${lineNumber}: GitHub expression ` +
      '${{ ' +
      match[1].trim() +
      ' }} must not be interpolated directly into run; pass it through env and quote the shell variable',
  )
}

function runHeader(line) {
  const match = line.match(/^(\s*)(-\s+)?run:\s*(.*)$/)
  if (!match) return null

  const sequenceItem = Boolean(match[2])
  const headerIndent = match[1].length
  return {
    value: match[3],
    sequenceItem,
    headerIndent,
    propertyIndent: headerIndent + (sequenceItem ? 2 : 0),
  }
}

function stepRange(lines, runIndex, header) {
  let start = runIndex
  if (!header.sequenceItem) {
    for (let cursor = runIndex - 1; cursor >= 0; cursor -= 1) {
      const line = lines[cursor]
      if (!line.trim()) continue
      if (indentation(line) < header.propertyIndent) {
        start = cursor
        break
      }
    }
  }

  let end = lines.length
  for (let cursor = runIndex + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    if (!line.trim()) continue
    if (indentation(line) < header.propertyIndent) {
      end = cursor
      break
    }
  }

  return { start, end }
}

function stepShell(lines, runIndex, header) {
  const { start, end } = stepRange(lines, runIndex, header)
  for (let cursor = start; cursor < end; cursor += 1) {
    if (indentation(lines[cursor]) !== header.propertyIndent) continue
    const match = lines[cursor].trim().match(/^shell:\s*([^#]+?)(?:\s+#.*)?$/)
    if (match) return match[1].trim()
  }
  return null
}

function blockScriptLines(lines, runIndex, propertyIndent) {
  const script = []
  for (let cursor = runIndex + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    if (line.trim() && indentation(line) <= propertyIndent) break
    script.push({ line, lineNumber: cursor + 1 })
  }
  return script
}

function validateBlockRun(lines, runIndex, header, relativePath, errors) {
  const shell = stepShell(lines, runIndex, header)
  if (shell === null) {
    errors.push(`${relativePath}:${runIndex + 1}: multiline run step must declare shell: bash`)
  } else if (shell !== 'bash') {
    errors.push(
      `${relativePath}:${runIndex + 1}: multiline run step must use shell: bash, found ${shell}`,
    )
  }

  const script = blockScriptLines(lines, runIndex, header.propertyIndent)
  const firstCommand = script.find(({ line }) => {
    const trimmed = line.trim()
    return trimmed && !trimmed.startsWith('#')
  })

  if (!firstCommand || !STRICT_BASH_RE.test(firstCommand.line.trim())) {
    errors.push(
      `${relativePath}:${runIndex + 1}: multiline run step must begin with set -euo pipefail`,
    )
  }

  for (const { line, lineNumber } of script) {
    validateRunText(line, relativePath, lineNumber, errors)
  }
}

export function validateRunContextExpressions(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const errors = []

  for (let index = 0; index < lines.length; index += 1) {
    const header = runHeader(lines[index])
    if (!header) continue

    if (!BLOCK_SCALAR_RE.test(header.value)) {
      validateRunText(header.value, normalizedPath, index + 1, errors)
      continue
    }

    validateBlockRun(lines, index, header, normalizedPath, errors)
  }

  return errors
}

export async function validateWorkflowRunContexts(directory = WORKFLOW_DIR) {
  const files = await discoverWorkflowFiles(directory)
  if (files.length === 0) return [`${workflowPath(directory)}: no workflow files found`]

  const errors = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    errors.push(...validateRunContextExpressions(source, workflowPath(file)))
  }
  return errors
}

async function main() {
  const errors = await validateWorkflowRunContexts()
  if (errors.length > 0) {
    console.error('Workflow run-context validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const files = await discoverWorkflowFiles()
  console.log(`Validated run-script contexts in ${files.length} workflow files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

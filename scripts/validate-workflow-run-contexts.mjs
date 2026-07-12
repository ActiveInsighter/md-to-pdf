import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const BLOCK_SCALAR_RE = /^[|>][+-]?(?:[1-9])?\s*(?:#.*)?$/
const RUN_EXPRESSION_RE = /\$\{\{\s*([^}]+?)\s*\}\}/

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
    `${relativePath}:${lineNumber}: GitHub expression ${{ ${match[1].trim()} }} must not be interpolated directly into run; pass it through env and quote the shell variable`,
  )
}

export function validateRunContextExpressions(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const errors = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/)
    if (!match) continue

    const runIndent = match[1].length
    const value = match[2]
    if (!BLOCK_SCALAR_RE.test(value)) {
      validateRunText(value, normalizedPath, index + 1, errors)
      continue
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]
      if (line.trim() && indentation(line) <= runIndent) break
      validateRunText(line, normalizedPath, cursor + 1, errors)
    }
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

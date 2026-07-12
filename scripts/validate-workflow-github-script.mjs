import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const BLOCK_SCALAR_RE = /^[|>][+-]?(?:[1-9])?\s*(?:#.*)?$/
const GITHUB_EXPRESSION_RE = /\$\{\{\s*([^}]+?)\s*\}\}/g

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function githubScriptHeader(line) {
  const match = line.match(/^(\s*)(-\s+)?uses:\s*actions\/github-script@[^\s#]+(?:\s+#.*)?$/)
  if (!match) return null

  const sequenceItem = Boolean(match[2])
  const headerIndent = match[1].length
  return {
    sequenceItem,
    headerIndent,
    propertyIndent: headerIndent + (sequenceItem ? 2 : 0),
  }
}

function stepRange(lines, usesIndex, header) {
  let start = usesIndex
  if (!header.sequenceItem) {
    for (let cursor = usesIndex - 1; cursor >= 0; cursor -= 1) {
      const line = lines[cursor]
      if (!line.trim()) continue
      if (indentation(line) < header.propertyIndent) {
        start = cursor
        break
      }
    }
  }

  let end = lines.length
  for (let cursor = usesIndex + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor]
    if (!line.trim()) continue
    if (indentation(line) < header.propertyIndent) {
      end = cursor
      break
    }
  }

  return { start, end }
}

function validateScriptText(text, relativePath, lineNumber, errors) {
  for (const match of text.matchAll(GITHUB_EXPRESSION_RE)) {
    errors.push(
      `${relativePath}:${lineNumber}: GitHub expression ` +
        '${{ ' +
        match[1].trim() +
        ' }} must not be interpolated directly into actions/github-script; pass it through step env and read process.env',
    )
  }
}

function validateGithubScriptStep(lines, usesIndex, header, relativePath, errors) {
  const { start, end } = stepRange(lines, usesIndex, header)
  const scriptIndent = header.propertyIndent + 2

  for (let cursor = start; cursor < end; cursor += 1) {
    if (indentation(lines[cursor]) !== scriptIndent) continue
    const match = lines[cursor].trim().match(/^script:\s*(.*)$/)
    if (!match) continue

    const value = match[1]
    if (!BLOCK_SCALAR_RE.test(value)) {
      validateScriptText(value, relativePath, cursor + 1, errors)
      return
    }

    for (let scriptCursor = cursor + 1; scriptCursor < end; scriptCursor += 1) {
      const line = lines[scriptCursor]
      if (line.trim() && indentation(line) <= scriptIndent) break
      validateScriptText(line, relativePath, scriptCursor + 1, errors)
    }
    return
  }
}

export function validateGithubScriptExpressions(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const errors = []

  for (let index = 0; index < lines.length; index += 1) {
    const header = githubScriptHeader(lines[index])
    if (!header) continue
    validateGithubScriptStep(lines, index, header, normalizedPath, errors)
  }

  return errors
}

export async function validateWorkflowGithubScripts(directory = WORKFLOW_DIR) {
  const files = await discoverWorkflowFiles(directory)
  if (files.length === 0) return [`${workflowPath(directory)}: no workflow files found`]

  const errors = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    errors.push(...validateGithubScriptExpressions(source, workflowPath(file)))
  }
  return errors
}

async function main() {
  const errors = await validateWorkflowGithubScripts()
  if (errors.length > 0) {
    console.error('Workflow github-script validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const files = await discoverWorkflowFiles()
  console.log(`Validated actions/github-script inputs in ${files.length} workflow files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

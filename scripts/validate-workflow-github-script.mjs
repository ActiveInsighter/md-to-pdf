import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { discoverWorkflowFiles } from './validate-workflow-security.mjs'

const WORKFLOW_DIR = '.github/workflows'
const GITHUB_SCRIPT_ACTION_RE = /^actions\/github-script@/
const GITHUB_EXPRESSION_RE = /\$\{\{\s*([^}]+?)\s*\}\}/g

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

export function validateGithubScriptExpressions(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  let workflow
  try {
    workflow = load(source)
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return [`${normalizedPath}: invalid workflow YAML: ${message}`]
  }

  if (!isRecord(workflow) || !isRecord(workflow.jobs)) return []

  const errors = []
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (!isRecord(job) || !Array.isArray(job.steps)) continue

    for (const [stepIndex, step] of job.steps.entries()) {
      if (!isRecord(step) || typeof step.uses !== 'string') continue
      if (!GITHUB_SCRIPT_ACTION_RE.test(step.uses)) continue

      const withConfig = isRecord(step.with) ? step.with : null
      const script = withConfig && typeof withConfig.script === 'string' ? withConfig.script : null
      if (script === null) continue

      for (const match of script.matchAll(GITHUB_EXPRESSION_RE)) {
        errors.push(
          `${normalizedPath}: jobs.${jobName}.steps[${stepIndex}] GitHub expression ` +
            '${{ ' +
            match[1].trim() +
            ' }} must not be interpolated directly into actions/github-script; pass it through step env and read process.env',
        )
      }
    }
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

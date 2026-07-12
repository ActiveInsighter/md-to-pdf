import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW_DIR = '.github/workflows'
const CHECKOUT_ACTION = 'actions/checkout'
const SHA_REF_RE = /^[0-9a-f]{40}$/
const DOCKER_DIGEST_RE = /@sha256:[0-9a-f]{64}$/

const ALLOWED_WRITE_PERMISSIONS = new Map([
  ['.github/workflows/build-pdf.yml', new Set(['contents'])],
  ['.github/workflows/cleanup-branches.yml', new Set(['contents'])],
  ['.github/workflows/deploy-pages.yml', new Set(['deployments', 'statuses'])],
  ['.github/workflows/smoke-supabase-service.yml', new Set(['statuses'])],
])

const CREDENTIAL_WRITER_WORKFLOW = '.github/workflows/build-pdf.yml'

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function workflowPath(filePath) {
  return filePath.split(path.sep).join('/')
}

export async function discoverWorkflowFiles(directory = WORKFLOW_DIR) {
  const files = []

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(absolute)
      } else if (/\.ya?ml$/i.test(entry.name)) {
        files.push(workflowPath(absolute))
      }
    }
  }

  await visit(directory)
  return files.sort()
}

function parseTopLevelPermissions(lines, relativePath, errors) {
  const jobsIndex = lines.findIndex(
    (line) => indentation(line) === 0 && /^jobs:\s*(?:#.*)?$/.test(line.trim()),
  )
  const permissionsIndex = lines.findIndex(
    (line) => indentation(line) === 0 && /^permissions:\s*(?:#.*)?$/.test(line.trim()),
  )

  if (permissionsIndex === -1 || (jobsIndex !== -1 && permissionsIndex > jobsIndex)) {
    errors.push(`${relativePath}: missing explicit top-level permissions map`)
    return new Map()
  }

  const permissions = new Map()
  for (let index = permissionsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (indentation(line) === 0) break

    const match = line.match(/^\s+([a-z-]+):\s*(read|write|none)\s*(?:#.*)?$/)
    if (!match) {
      errors.push(`${relativePath}:${index + 1}: invalid permission entry`)
      continue
    }
    permissions.set(match[1], match[2])
  }

  if (permissions.size === 0) {
    errors.push(`${relativePath}: permissions map must declare at least one scope`)
  }

  const allowedWrites = ALLOWED_WRITE_PERMISSIONS.get(relativePath) ?? new Set()
  for (const [scope, level] of permissions) {
    if (level === 'write' && !allowedWrites.has(scope)) {
      errors.push(`${relativePath}: unexpected write permission for ${scope}`)
    }
  }

  return permissions
}

function actionReference(line) {
  const match = line.match(/^\s*uses:\s*(.+)$/)
  if (!match) return null
  return match[1].replace(/\s+#.*$/, '').trim()
}

function validateActionReferences(lines, relativePath, errors) {
  for (let index = 0; index < lines.length; index += 1) {
    const reference = actionReference(lines[index])
    if (!reference) continue
    if (reference.startsWith('./')) continue
    if (reference.startsWith('docker://')) {
      if (!DOCKER_DIGEST_RE.test(reference)) {
        errors.push(`${relativePath}:${index + 1}: Docker action must use a sha256 digest`)
      }
      continue
    }

    const separator = reference.lastIndexOf('@')
    const action = separator === -1 ? reference : reference.slice(0, separator)
    const ref = separator === -1 ? '' : reference.slice(separator + 1)
    if (!SHA_REF_RE.test(ref)) {
      errors.push(
        `${relativePath}:${index + 1}: action ${action} must be pinned to a 40-character commit SHA`,
      )
    }
  }
}

function validateCheckoutCredentials(lines, relativePath, errors) {
  let checkoutCount = 0
  let credentialWriterCount = 0

  for (let index = 0; index < lines.length; index += 1) {
    const reference = actionReference(lines[index])
    if (!reference?.startsWith(`${CHECKOUT_ACTION}@`)) continue

    checkoutCount += 1
    const usesIndent = indentation(lines[index])
    let setting = null

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      if (indentation(line) < usesIndent) break

      const persistMatch = line.match(/^\s*persist-credentials:\s*(true|false)\s*(?:#.*)?$/)
      if (persistMatch) {
        setting = persistMatch[1]
        break
      }
    }

    if (setting === null) {
      errors.push(`${relativePath}:${index + 1}: checkout must set persist-credentials explicitly`)
    } else if (setting === 'true') {
      credentialWriterCount += 1
      if (relativePath !== CREDENTIAL_WRITER_WORKFLOW) {
        errors.push(
          `${relativePath}:${index + 1}: checkout credentials may only persist in ${CREDENTIAL_WRITER_WORKFLOW}`,
        )
      }
    }
  }

  if (relativePath === CREDENTIAL_WRITER_WORKFLOW) {
    if (checkoutCount === 0) errors.push(`${relativePath}: expected a checkout step`)
    if (credentialWriterCount !== checkoutCount) {
      errors.push(
        `${relativePath}: every checkout must retain credentials because this workflow publishes repository changes`,
      )
    }
  }
}

export function validateWorkflowText(source, relativePath) {
  const normalizedPath = workflowPath(relativePath)
  const lines = source.split(/\r?\n/)
  const errors = []

  if (/^\s*pull_request_target\s*:/m.test(source)) {
    errors.push(`${normalizedPath}: pull_request_target is not allowed`)
  }

  parseTopLevelPermissions(lines, normalizedPath, errors)
  validateActionReferences(lines, normalizedPath, errors)
  validateCheckoutCredentials(lines, normalizedPath, errors)

  return errors
}

export async function validateWorkflowDirectory(directory = WORKFLOW_DIR) {
  const files = await discoverWorkflowFiles(directory)
  if (files.length === 0) return [`${workflowPath(directory)}: no workflow files found`]

  const errors = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    errors.push(...validateWorkflowText(source, workflowPath(file)))
  }
  return errors
}

async function main() {
  const errors = await validateWorkflowDirectory()
  if (errors.length > 0) {
    console.error('Workflow security validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const files = await discoverWorkflowFiles()
  console.log(`Validated ${files.length} workflow files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

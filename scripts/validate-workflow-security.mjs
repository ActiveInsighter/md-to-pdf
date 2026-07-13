import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW_DIR = '.github/workflows'
const CHECKOUT_ACTION = 'actions/checkout'
const SHA_REF_RE = /^[0-9a-f]{40}$/
const DOCKER_DIGEST_RE = /@sha256:[0-9a-f]{64}$/
const PERMISSION_RANK = new Map([
  ['none', 0],
  ['read', 1],
  ['write', 2],
])

const ALLOWED_WRITE_PERMISSIONS = new Map([
  ['.github/workflows/cleanup-branches.yml', new Set(['contents'])],
  ['.github/workflows/deploy-pages.yml', new Set(['deployments', 'statuses'])],
  ['.github/workflows/smoke-supabase-service.yml', new Set(['statuses'])],
])

const RETIRED_WORKFLOW_PATHS = new Set([
  '.github/workflows/build-pdf.yml',
])
const RETIRED_WORKFLOW_MARKERS = [
  { pattern: /\binbox(?:[\\/]|$)/im, label: 'repository inbox queue' },
  { pattern: /\bPublish output branch\b|refs\/heads\/output/i, label: 'output branch publishing' },
]

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

function parsePermissionMap(
  lines,
  startIndex,
  blockIndent,
  relativePath,
  errors,
  context,
  { allowEmpty = false } = {},
) {
  const header = lines[startIndex].trim()
  if (/^permissions:\s*\{\}\s*(?:#.*)?$/.test(header)) {
    if (!allowEmpty) {
      errors.push(`${relativePath}:${startIndex + 1}: ${context} permissions map cannot be empty`)
    }
    return new Map()
  }

  if (!/^permissions:\s*(?:#.*)?$/.test(header)) {
    errors.push(
      `${relativePath}:${startIndex + 1}: ${context} permissions must use an explicit map or {}`,
    )
    return new Map()
  }

  const permissions = new Map()
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (indentation(line) <= blockIndent) break

    const match = line.match(/^\s+([a-z-]+):\s*(read|write|none)\s*(?:#.*)?$/)
    if (!match) {
      errors.push(`${relativePath}:${index + 1}: invalid ${context} permission entry`)
      continue
    }
    permissions.set(match[1], match[2])
  }

  if (permissions.size === 0 && !allowEmpty) {
    errors.push(`${relativePath}: ${context} permissions map must declare at least one scope`)
  }

  return permissions
}

function validateAllowedWrites(permissions, relativePath, errors, context) {
  const allowedWrites = ALLOWED_WRITE_PERMISSIONS.get(relativePath) ?? new Set()
  for (const [scope, level] of permissions) {
    if (level === 'write' && !allowedWrites.has(scope)) {
      errors.push(`${relativePath}: unexpected ${context} write permission for ${scope}`)
    }
  }
}

function parseTopLevelPermissions(lines, relativePath, errors) {
  const jobsIndex = lines.findIndex(
    (line) => indentation(line) === 0 && /^jobs:\s*(?:#.*)?$/.test(line.trim()),
  )
  const permissionsIndex = lines.findIndex(
    (line) => indentation(line) === 0 && /^permissions\s*:/.test(line.trim()),
  )

  if (permissionsIndex === -1 || (jobsIndex !== -1 && permissionsIndex > jobsIndex)) {
    errors.push(`${relativePath}: missing explicit top-level permissions map`)
    return new Map()
  }

  const permissions = parsePermissionMap(
    lines,
    permissionsIndex,
    0,
    relativePath,
    errors,
    'top-level',
  )
  validateAllowedWrites(permissions, relativePath, errors, 'top-level')
  return permissions
}

function validateJobPermissions(lines, relativePath, topLevelPermissions, errors) {
  const jobsIndex = lines.findIndex(
    (line) => indentation(line) === 0 && /^jobs:\s*(?:#.*)?$/.test(line.trim()),
  )
  if (jobsIndex === -1) return

  const jobBlocks = []
  let jobIndent = null
  let jobsEnd = lines.length

  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const indent = indentation(line)
    if (indent === 0) {
      jobsEnd = index
      break
    }

    if (jobIndent === null) jobIndent = indent
    if (indent !== jobIndent) continue

    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/)
    if (!match) continue
    if (jobBlocks.length > 0) jobBlocks.at(-1).end = index
    jobBlocks.push({ id: match[1], start: index, end: jobsEnd, indent })
  }

  if (jobBlocks.length > 0) jobBlocks.at(-1).end = jobsEnd

  for (const job of jobBlocks) {
    let propertyIndent = Number.POSITIVE_INFINITY
    for (let index = job.start + 1; index < job.end; index += 1) {
      const line = lines[index]
      if (!line.trim() || line.trimStart().startsWith('#')) continue
      const indent = indentation(line)
      if (indent > job.indent) propertyIndent = Math.min(propertyIndent, indent)
    }
    if (!Number.isFinite(propertyIndent)) continue

    const permissionIndexes = []
    for (let index = job.start + 1; index < job.end; index += 1) {
      if (indentation(lines[index]) !== propertyIndent) continue
      if (/^permissions\s*:/.test(lines[index].trim())) permissionIndexes.push(index)
    }

    if (permissionIndexes.length > 1) {
      errors.push(`${relativePath}:${permissionIndexes[1] + 1}: job ${job.id} has duplicate permissions`)
    }

    for (const permissionsIndex of permissionIndexes) {
      const permissions = parsePermissionMap(
        lines,
        permissionsIndex,
        propertyIndent,
        relativePath,
        errors,
        `job ${job.id}`,
        { allowEmpty: true },
      )
      validateAllowedWrites(permissions, relativePath, errors, `job ${job.id}`)

      for (const [scope, level] of permissions) {
        const topLevel = topLevelPermissions.get(scope) ?? 'none'
        if (PERMISSION_RANK.get(level) > PERMISSION_RANK.get(topLevel)) {
          errors.push(
            `${relativePath}:${permissionsIndex + 1}: job ${job.id} permission ${scope}:${level} exceeds top-level ${topLevel}`,
          )
        }
      }
    }
  }
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
  for (let index = 0; index < lines.length; index += 1) {
    const reference = actionReference(lines[index])
    if (!reference?.startsWith(`${CHECKOUT_ACTION}@`)) continue

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
      errors.push(`${relativePath}:${index + 1}: checkout credentials must not persist`)
    }
  }
}

function validateRetiredWorkflowArchitecture(source, relativePath, errors) {
  if (RETIRED_WORKFLOW_PATHS.has(relativePath)) {
    errors.push(`${relativePath}: retired repository-backed PDF workflow path must not be restored`)
  }

  for (const { pattern, label } of RETIRED_WORKFLOW_MARKERS) {
    if (pattern.test(source)) {
      errors.push(`${relativePath}: retired ${label} must not be restored`)
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

  validateRetiredWorkflowArchitecture(source, normalizedPath, errors)
  const topLevelPermissions = parseTopLevelPermissions(lines, normalizedPath, errors)
  validateJobPermissions(lines, normalizedPath, topLevelPermissions, errors)
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

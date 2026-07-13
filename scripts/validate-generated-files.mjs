import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const FORBIDDEN_TRACKED_PATH = /(?:^ui-ux-pro-max\/|(^|\/)(node_modules\/|dist\/|\.tmp\/|work\/|coverage\/|playwright-report\/|test-results\/|__pycache__\/|\.github\/(?:latest-(?:workflow-)?run(?:-attempt|-id)?|workflow-run-state)\.(?:txt|json)$|[^/]+\.py[co]$|[^/]+\.tsbuildinfo$|smoke-diagnostic\.json$|lint-output\.txt$))/

export const IGNORED_PATH_PROBES = [
  'node_modules/example.txt',
  'dist/example.txt',
  '.tmp/example.txt',
  'work/example.txt',
  'coverage/example.txt',
  'playwright-report/example.txt',
  'test-results/example.txt',
  'frontend/tsconfig.tsbuildinfo',
  'frontend/smoke-diagnostic.json',
  'frontend/lint-output.txt',
]

export function findForbiddenTrackedFiles(trackedFiles, deletedFiles = []) {
  const deleted = new Set(deletedFiles)
  return trackedFiles.filter((file) => !deleted.has(file) && FORBIDDEN_TRACKED_PATH.test(file))
}

function listTrackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

function listDeletedTrackedFiles() {
  return execFileSync('git', ['ls-files', '--deleted'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

function isIgnored(target) {
  return spawnSync('git', ['check-ignore', '--quiet', target]).status === 0
}

export function validateGeneratedFiles({
  trackedFiles = listTrackedFiles(),
  deletedFiles = [],
  ignoredPaths = IGNORED_PATH_PROBES,
  checkIgnored = isIgnored,
} = {}) {
  const errors = []
  const forbiddenFiles = findForbiddenTrackedFiles(trackedFiles, deletedFiles)

  for (const file of forbiddenFiles) {
    errors.push(`Generated or repository-external file must not be tracked: ${file}`)
  }

  for (const target of ignoredPaths) {
    if (!checkIgnored(target)) errors.push(`Expected path to be ignored: ${target}`)
  }

  return errors
}

function main() {
  const trackedFiles = listTrackedFiles()
  const deletedFiles = listDeletedTrackedFiles()
  const errors = validateGeneratedFiles({ trackedFiles, deletedFiles })

  if (errors.length > 0) {
    console.error('Generated file and repository hygiene validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log(`Validated generated output policy for ${trackedFiles.length} tracked files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}

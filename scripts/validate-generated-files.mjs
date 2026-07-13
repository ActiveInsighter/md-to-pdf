import { execFileSync, spawnSync } from 'node:child_process'

const forbiddenPattern = /(^|\/)(node_modules\/|dist\/|\.tmp\/|work\/|coverage\/|playwright-report\/|test-results\/|__pycache__\/|[^/]+\.py[co]$|[^/]+\.tsbuildinfo$|smoke-diagnostic\.json$|lint-output\.txt$)/

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

const forbiddenFiles = trackedFiles.filter((file) => forbiddenPattern.test(file))
if (forbiddenFiles.length > 0) {
  console.error('Generated files must not be tracked:')
  for (const file of forbiddenFiles) console.error(file)
  process.exit(1)
}

const ignoredPaths = [
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
  'ui-ux-pro-max/scripts/__pycache__/example.pyc',
]

for (const path of ignoredPaths) {
  const result = spawnSync('git', ['check-ignore', '--quiet', path])
  if (result.status !== 0) {
    console.error(`Expected path to be ignored: ${path}`)
    process.exit(1)
  }
}

console.log(`Validated generated output policy for ${trackedFiles.length} tracked files.`)

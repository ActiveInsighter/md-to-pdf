import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  collectRendererScriptDependencies,
  extractEventPaths,
  validateRendererWorkflowPaths,
} from './validate-workflow-renderer-paths.mjs'

const SCRIPT_PATHS = [
  'scripts/build-pdf.mjs',
  'scripts/lib/path-utils.mjs',
  'scripts/lib/render-preflight.mjs',
  'scripts/postprocess-pdfs.mjs',
  'scripts/test-render.mjs',
]
const STATIC_PATHS = [
  'themes/**',
  'style.css',
  'fixtures/**',
  'package.json',
  'package-lock.json',
  '.github/workflows/build-pdf.yml',
  '.github/workflows/build-pdf-api.yml',
  '.github/workflows/validate-renderer.yml',
]

function workflow(paths = [...SCRIPT_PATHS, ...STATIC_PATHS]) {
  const list = paths.map((entry) => `      - '${entry}'`).join('\n')
  return `name: Renderer\n\non:\n  push:\n    branches:\n      - main\n    paths:\n${list}\n  pull_request:\n    paths:\n${list}\n  workflow_dispatch:\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm test\n`
}

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'renderer-paths-'))
  await mkdir(path.join(root, 'scripts', 'lib'), { recursive: true })
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true })
  await Promise.all([
    writeFile(
      path.join(root, 'scripts', 'test-render.mjs'),
      "import './lib/render-preflight.mjs'\nimport fs from 'node:fs'\n",
    ),
    writeFile(path.join(root, 'scripts', 'build-pdf.mjs'), "import path from 'node:path'\n"),
    writeFile(path.join(root, 'scripts', 'postprocess-pdfs.mjs'), "import os from 'node:os'\n"),
    writeFile(
      path.join(root, 'scripts', 'lib', 'render-preflight.mjs'),
      "export { value } from './path-utils.mjs'\n",
    ),
    writeFile(path.join(root, 'scripts', 'lib', 'path-utils.mjs'), 'export const value = true\n'),
    writeFile(path.join(root, '.github', 'workflows', 'validate-renderer.yml'), workflow()),
  ])
  return root
}

test('extracts push and pull request path filters', () => {
  const source = workflow()
  assert.deepEqual(extractEventPaths(source, 'push'), [...SCRIPT_PATHS, ...STATIC_PATHS])
  assert.deepEqual(extractEventPaths(source, 'pull_request'), [...SCRIPT_PATHS, ...STATIC_PATHS])
})

test('collects the transitive local script dependency closure', async () => {
  const root = await createFixtureRoot()
  try {
    assert.deepEqual(await collectRendererScriptDependencies(root), SCRIPT_PATHS)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('accepts exact renderer dependency paths', async () => {
  const root = await createFixtureRoot()
  try {
    assert.deepEqual(await validateRendererWorkflowPaths({ root }), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects broad scripts triggers and missing transitive dependencies', async () => {
  const root = await createFixtureRoot()
  try {
    const unsafe = workflow([
      'scripts/**',
      ...SCRIPT_PATHS.filter((entry) => entry !== 'scripts/lib/path-utils.mjs'),
      ...STATIC_PATHS,
    ])
    await writeFile(path.join(root, '.github', 'workflows', 'validate-renderer.yml'), unsafe)
    const errors = await validateRendererWorkflowPaths({ root })
    assert.ok(errors.some((error) => error.includes('must not use the broad scripts/** trigger')))
    assert.ok(errors.some((error) => error.includes('missing scripts/lib/path-utils.mjs')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects unrelated and asymmetric trigger paths', async () => {
  const root = await createFixtureRoot()
  try {
    const source = workflow([...SCRIPT_PATHS, ...STATIC_PATHS, 'scripts/security-only.mjs'])
      .replace("      - 'scripts/security-only.mjs'\n  workflow_dispatch:", '  workflow_dispatch:')
    await writeFile(path.join(root, '.github', 'workflows', 'validate-renderer.yml'), source)
    const errors = await validateRendererWorkflowPaths({ root })
    assert.ok(errors.some((error) => error.includes('push paths contain unrelated trigger scripts/security-only.mjs')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

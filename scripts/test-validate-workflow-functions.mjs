import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  discoverEdgeFunctions,
  extractDeclaredFunctions,
  validateFunctionsWorkflow,
} from './validate-workflow-functions.mjs'

const FUNCTIONS = [
  'cancel-pdf-job',
  'create-pdf-job',
  'favorite-pdf-job',
  'get-pdf-download',
  'rebuild-pdf-job',
  'start-pdf-job',
]

function workflow({ functions = FUNCTIONS, migrationPath = 'supabase/migrations/**' } = {}) {
  const functionLines = functions.map((name) => `            ${name}`).join('\n')
  return `name: Validate Supabase Functions\n\non:\n  pull_request:\n    branches:\n      - main\n    paths:\n      - '.github/workflows/validate-functions.yml'\n      - 'package.json'\n      - 'package-lock.json'\n      - 'supabase/config.toml'\n      - 'supabase/functions/**'\n      - '${migrationPath}'\n  workflow_dispatch:\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Install locked validation tools\n        run: npm ci --no-audit --no-fund\n      - name: Test shared Edge Function modules\n        run: npm run test:functions\n      - name: Type-check every Edge Function\n        run: npm run check:functions\n      - name: Validate shared function wiring\n        shell: bash\n        run: |\n          functions=(\n${functionLines}\n          )\n`
}

async function createFixtureRoot(source = workflow()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'functions-workflow-'))
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true })
  await mkdir(path.join(root, 'supabase', 'functions', '_shared'), { recursive: true })
  await Promise.all([
    ...FUNCTIONS.map((name) => mkdir(path.join(root, 'supabase', 'functions', name), { recursive: true })),
    writeFile(path.join(root, '.github', 'workflows', 'validate-functions.yml'), source),
  ])
  return root
}

test('extracts and discovers every Edge Function', async () => {
  const root = await createFixtureRoot()
  try {
    assert.deepEqual(extractDeclaredFunctions(workflow()), FUNCTIONS)
    assert.deepEqual(await discoverEdgeFunctions(root), FUNCTIONS)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('accepts complete Edge Function and migration trigger coverage', async () => {
  const root = await createFixtureRoot()
  try {
    assert.deepEqual(await validateFunctionsWorkflow({ root }), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects missing or unknown Edge Functions', async () => {
  const root = await createFixtureRoot(workflow({
    functions: [...FUNCTIONS.filter((name) => name !== 'rebuild-pdf-job'), 'unknown-pdf-job'],
  }))
  try {
    const errors = await validateFunctionsWorkflow({ root })
    assert.ok(errors.some((error) => error.includes('missing rebuild-pdf-job')))
    assert.ok(errors.some((error) => error.includes('unknown function unknown-pdf-job')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects a single migration file trigger', async () => {
  const migrationPath = 'supabase/migrations/20260711134257_create_pdf_jobs.sql'
  const root = await createFixtureRoot(workflow({ migrationPath }))
  try {
    const errors = await validateFunctionsWorkflow({ root })
    assert.ok(errors.some((error) => error.includes('missing supabase/migrations/**')))
    assert.ok(errors.some((error) => error.includes(`instead of ${migrationPath}`)))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('requires dependency manifests, locked install, shared tests, and Deno checks', async (t) => {
  const cases = [
    {
      name: 'package.json trigger',
      source: workflow().replace("      - 'package.json'\n", ''),
      expected: 'pull_request paths are missing package.json',
    },
    {
      name: 'package-lock.json trigger',
      source: workflow().replace("      - 'package-lock.json'\n", ''),
      expected: 'pull_request paths are missing package-lock.json',
    },
    {
      name: 'locked dependency install',
      source: workflow().replace('        run: npm ci --no-audit --no-fund\n', ''),
      expected: 'missing required command npm ci --no-audit --no-fund',
    },
    {
      name: 'shared function tests',
      source: workflow().replace('        run: npm run test:functions\n', ''),
      expected: 'missing required command npm run test:functions',
    },
    {
      name: 'Deno type checks',
      source: workflow().replace('        run: npm run check:functions\n', ''),
      expected: 'missing required command npm run check:functions',
    },
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const root = await createFixtureRoot(fixture.source)
      try {
        const errors = await validateFunctionsWorkflow({ root })
        assert.ok(errors.some((error) => error.includes(fixture.expected)))
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
})

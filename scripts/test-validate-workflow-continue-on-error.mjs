import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateContinueOnError,
  validateContinueOnErrorDirectory,
} from './validate-workflow-continue-on-error.mjs'

const BEST_EFFORT_WORKFLOW = `name: API\n\non:\n  workflow_dispatch:\n\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 10\n    steps:\n      - name: Delete source objects after success\n        continue-on-error: true\n        run: node cleanup.mjs\n      - name: Upload one-day debug artifact\n        if: always()\n        continue-on-error: true\n        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\n      - name: Mark failed\n        if: failure()\n        continue-on-error: true\n        run: node mark-failed.mjs\n`

test('accepts approved best-effort API cleanup and reporting steps', () => {
  assert.deepEqual(
    validateContinueOnError(BEST_EFFORT_WORKFLOW, '.github/workflows/build-pdf-api.yml'),
    [],
  )
})

test('rejects unapproved, unnamed, and job-level continue-on-error settings', () => {
  const unapproved = BEST_EFFORT_WORKFLOW.replace('Delete source objects after success', 'Ignore tests')
  assert.match(
    validateContinueOnError(unapproved, '.github/workflows/build-pdf-api.yml')[0],
    /not approved/,
  )

  const unnamed = `jobs:\n  validate:\n    steps:\n      - run: npm test\n        continue-on-error: true\n`
  assert.match(validateContinueOnError(unnamed, 'unnamed.yml')[0], /unnamed steps/)

  const jobLevel = `jobs:\n  validate:\n    runs-on: ubuntu-24.04\n    continue-on-error: true\n    steps:\n      - name: Test\n        run: npm test\n`
  assert.match(validateContinueOnError(jobLevel, 'job-level.yml')[0], /scoped to a named approved step/)
})

test('requires a single literal true value', () => {
  const expression = BEST_EFFORT_WORKFLOW.replace(
    'continue-on-error: true',
    "continue-on-error: \${{ github.event_name == 'push' }}",
  )
  assert.match(
    validateContinueOnError(expression, '.github/workflows/build-pdf-api.yml')[0],
    /literal true/,
  )

  const duplicate = BEST_EFFORT_WORKFLOW.replace(
    'continue-on-error: true',
    'continue-on-error: true\n        continue-on-error: true',
  )
  assert.match(
    validateContinueOnError(duplicate, '.github/workflows/build-pdf-api.yml')[0],
    /more than once/,
  )
})

test('enforces approved conditions for diagnostic and failure-reporting steps', () => {
  const missingAlways = BEST_EFFORT_WORKFLOW.replace('        if: always()\n', '')
  assert.match(
    validateContinueOnError(missingAlways, '.github/workflows/build-pdf-api.yml')[0],
    /must use if: always\(\)/,
  )

  const wrongFailure = BEST_EFFORT_WORKFLOW.replace('if: failure()', 'if: always()')
  assert.match(
    validateContinueOnError(wrongFailure, '.github/workflows/build-pdf-api.yml')[0],
    /must use if: failure\(\)/,
  )
})

test('directory validation checks both yml and yaml workflow files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-continue-on-error-'))
  try {
    await Promise.all([
      writeFile(
        path.join(root, 'safe.yml'),
        `jobs:\n  validate:\n    steps:\n      - name: Test\n        run: npm test\n`,
      ),
      writeFile(
        path.join(root, 'unsafe.yaml'),
        `jobs:\n  validate:\n    steps:\n      - name: Ignore tests\n        continue-on-error: true\n        run: npm test\n`,
      ),
    ])
    const errors = await validateContinueOnErrorDirectory(root)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /unsafe\.yaml/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateWorkflowConcurrency,
  validateWorkflowConcurrencyDirectory,
} from './validate-workflow-concurrency.mjs'

const CANCELABLE_WORKFLOW = `name: Validate\n\non:\n  pull_request:\n\nconcurrency:\n  group: validation-\${{ github.ref }}\n  cancel-in-progress: true\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    steps:\n      - run: npm test\n`

const TRANSACTIONAL_WORKFLOW = `name: Build\n\non:\n  workflow_dispatch:\n\nconcurrency:\n  group: pdf-api-\${{ inputs.job_id }}\n  cancel-in-progress: false\n\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n    steps:\n      - run: npm run build\n`

test('accepts replaceable workflows and approved transactional workflows', () => {
  assert.deepEqual(
    validateWorkflowConcurrency(CANCELABLE_WORKFLOW, '.github/workflows/validate-example.yml'),
    [],
  )
  assert.deepEqual(
    validateWorkflowConcurrency(TRANSACTIONAL_WORKFLOW, '.github/workflows/build-pdf-api.yml'),
    [],
  )
})

test('rejects missing or duplicate top-level concurrency blocks', () => {
  const missing = CANCELABLE_WORKFLOW.replace(
    /concurrency:\n  group: validation-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true\n\n/,
    '',
  )
  assert.match(validateWorkflowConcurrency(missing, 'missing.yml')[0], /must declare top-level concurrency/)

  const duplicate = `${CANCELABLE_WORKFLOW}\nconcurrency:\n  group: duplicate\n  cancel-in-progress: true\n`
  assert.match(validateWorkflowConcurrency(duplicate, 'duplicate.yml')[0], /more than once/)
})

test('requires one group and one literal cancel-in-progress value', () => {
  const missingGroup = CANCELABLE_WORKFLOW.replace('  group: validation-${{ github.ref }}\n', '')
  assert.match(validateWorkflowConcurrency(missingGroup, 'missing-group.yml')[0], /exactly one group/)

  const expression = CANCELABLE_WORKFLOW.replace('cancel-in-progress: true', 'cancel-in-progress: ${{ github.event_name == \'pull_request\' }}')
  assert.match(validateWorkflowConcurrency(expression, 'expression.yml')[0], /literal true or false/)
})

test('rejects concurrency groups that are unique for every run or commit', () => {
  for (const value of ['github.run_id', 'github.run_attempt', 'github.sha', 'github.event.after']) {
    const source = CANCELABLE_WORKFLOW.replace('github.ref', value)
    assert.match(validateWorkflowConcurrency(source, `${value}.yml`)[0], /defeat deduplication/)
  }
})

test('restricts cancel-in-progress false to approved transactional workflows and groups', () => {
  const unapproved = CANCELABLE_WORKFLOW.replace('cancel-in-progress: true', 'cancel-in-progress: false')
  assert.match(validateWorkflowConcurrency(unapproved, '.github/workflows/validate-example.yml')[0], /must use cancel-in-progress: true/)

  const cancellableTransaction = TRANSACTIONAL_WORKFLOW.replace('cancel-in-progress: false', 'cancel-in-progress: true')
  assert.match(validateWorkflowConcurrency(cancellableTransaction, '.github/workflows/build-pdf-api.yml')[0], /transactional workflow/)

  const wrongGroup = TRANSACTIONAL_WORKFLOW.replace('pdf-api-${{ inputs.job_id }}', 'per-run-${{ github.ref }}')
  assert.match(validateWorkflowConcurrency(wrongGroup, '.github/workflows/build-pdf-api.yml')[0], /must use concurrency group/)

  assert.match(
    validateWorkflowConcurrency(TRANSACTIONAL_WORKFLOW, '.github/workflows/retired-build.yml')[0],
    /must use cancel-in-progress: true/,
  )
})

test('directory validation checks both yml and yaml files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-concurrency-'))
  try {
    await Promise.all([
      writeFile(path.join(root, 'safe.yml'), CANCELABLE_WORKFLOW),
      writeFile(
        path.join(root, 'unsafe.yaml'),
        CANCELABLE_WORKFLOW.replace('cancel-in-progress: true', 'cancel-in-progress: false'),
      ),
    ])
    const errors = await validateWorkflowConcurrencyDirectory(root)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /unsafe\.yaml/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

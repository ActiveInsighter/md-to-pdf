import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateWorkflowTimeoutDirectory,
  validateWorkflowTimeouts,
} from './validate-workflow-timeouts.mjs'

const SAFE_WORKFLOW = `name: Safe\n\non:\n  pull_request:\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 10\n    steps:\n      - run: npm test\n  reusable:\n    uses: example/repository/.github/workflows/shared.yml@0123456789012345678901234567890123456789\n`

test('accepts bounded integer timeouts and skips reusable workflow call jobs', () => {
  assert.deepEqual(validateWorkflowTimeouts(SAFE_WORKFLOW, '.github/workflows/safe.yml'), [])
})

test('rejects runner jobs without timeout-minutes', () => {
  const source = SAFE_WORKFLOW.replace('    timeout-minutes: 10\n', '')
  const errors = validateWorkflowTimeouts(source, '.github/workflows/missing.yml')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /job validate must declare timeout-minutes/)
})

test('rejects duplicate, non-integer, zero, and excessive timeouts', () => {
  const duplicate = SAFE_WORKFLOW.replace(
    '    timeout-minutes: 10\n',
    '    timeout-minutes: 10\n    timeout-minutes: 20\n',
  )
  assert.match(validateWorkflowTimeouts(duplicate, 'duplicate.yml')[0], /more than once/)

  const expression = SAFE_WORKFLOW.replace('timeout-minutes: 10', 'timeout-minutes: ${{ matrix.timeout }}')
  assert.match(validateWorkflowTimeouts(expression, 'expression.yml')[0], /must be an integer/)

  const zero = SAFE_WORKFLOW.replace('timeout-minutes: 10', 'timeout-minutes: 0')
  assert.match(validateWorkflowTimeouts(zero, 'zero.yml')[0], /between 1 and 60/)

  const excessive = SAFE_WORKFLOW.replace('timeout-minutes: 10', 'timeout-minutes: 61')
  assert.match(validateWorkflowTimeouts(excessive, 'excessive.yml')[0], /between 1 and 60/)
})

test('validates every runner job independently', () => {
  const source = SAFE_WORKFLOW.replace(
    '  reusable:\n    uses:',
    '  build:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm run build\n  reusable:\n    uses:',
  )
  const errors = validateWorkflowTimeouts(source, '.github/workflows/multiple.yml')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /job build/)
})

test('directory validation checks both yml and yaml workflow files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-timeouts-'))
  try {
    await Promise.all([
      writeFile(path.join(root, 'safe.yml'), SAFE_WORKFLOW),
      writeFile(
        path.join(root, 'unsafe.yaml'),
        SAFE_WORKFLOW.replace('    timeout-minutes: 10\n', ''),
      ),
    ])
    const errors = await validateWorkflowTimeoutDirectory(root)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /unsafe\.yaml/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

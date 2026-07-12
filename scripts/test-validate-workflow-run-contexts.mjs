import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateRunContextExpressions,
  validateWorkflowRunContexts,
} from './validate-workflow-run-contexts.mjs'

const SAFE_WORKFLOW = `name: Safe\n\non:\n  pull_request:\n\npermissions:\n  contents: read\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Safe expression handoff\n        env:\n          PR_TITLE: \${{ github.event.pull_request.title }}\n          SOURCE: \${{ inputs.source }}\n          CACHE_HIT: \${{ steps.cache.outputs.cache-hit }}\n        if: github.event_name == 'pull_request'\n        run: |\n          printf '%s\\n' "$PR_TITLE"\n          printf '%s\\n' "$SOURCE"\n          printf '%s\\n' "$CACHE_HIT"\n`

test('allows GitHub expressions outside run when shell receives quoted environment variables', () => {
  assert.deepEqual(
    validateRunContextExpressions(SAFE_WORKFLOW, '.github/workflows/safe.yml'),
    [],
  )
})

test('rejects workflow inputs interpolated into inline run commands', () => {
  const source = SAFE_WORKFLOW.replace(
    'run: |\n          printf',
    'run: echo "\${{ inputs.source }}"\n      - name: Next\n        run: printf',
  )
  const errors = validateRunContextExpressions(source, '.github/workflows/unsafe.yml')
  assert.ok(errors.some((error) => error.includes('${{ inputs.source }}')))
  assert.ok(errors.some((error) => error.includes('pass it through env')))
})

test('rejects every GitHub expression in block run scripts', () => {
  const source = `jobs:\n  test:\n    steps:\n      - run: |\n          echo "\${{ github.event.pull_request.title }}"\n          echo "\${{ steps.build.outputs.result }}"\n      - run: >-\n          echo "\${{ secrets.DEPLOY_TOKEN }}"\n`
  const errors = validateRunContextExpressions(source, '.github/workflows/unsafe.yml')
  assert.equal(errors.length, 3)
  assert.ok(errors.some((error) => error.includes('github.event.pull_request.title')))
  assert.ok(errors.some((error) => error.includes('steps.build.outputs.result')))
  assert.ok(errors.some((error) => error.includes('secrets.DEPLOY_TOKEN')))
})

test('directory validation checks both yml and yaml files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-run-contexts-'))
  try {
    await Promise.all([
      writeFile(path.join(root, 'safe.yml'), SAFE_WORKFLOW),
      writeFile(path.join(root, 'unsafe.yaml'), 'jobs:\n  test:\n    steps:\n      - run: echo "\${{ runner.os }}"\n'),
    ])
    const errors = await validateWorkflowRunContexts(root)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /unsafe\.yaml:4:/)
    assert.match(errors[0], /runner\.os/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

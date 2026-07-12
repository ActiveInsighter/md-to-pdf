import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateRunContextExpressions,
  validateWorkflowRunContexts,
} from './validate-workflow-run-contexts.mjs'

const SAFE_WORKFLOW = `name: Safe\n\non:\n  pull_request:\n\npermissions:\n  contents: read\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Safe expression handoff\n        env:\n          PR_TITLE: \${{ github.event.pull_request.title }}\n          SOURCE: \${{ inputs.source }}\n          CACHE_HIT: \${{ steps.cache.outputs.cache-hit }}\n        if: github.event_name == 'pull_request'\n        shell: bash\n        run: |\n          # Keep GitHub expressions outside the shell script.\n          set -euo pipefail\n          printf '%s\\n' "$PR_TITLE"\n          printf '%s\\n' "$SOURCE"\n          printf '%s\\n' "$CACHE_HIT"\n`

test('allows strict Bash blocks with quoted environment variables', () => {
  assert.deepEqual(
    validateRunContextExpressions(SAFE_WORKFLOW, '.github/workflows/safe.yml'),
    [],
  )
})

test('rejects workflow inputs interpolated into inline run commands', () => {
  const source = `jobs:\n  test:\n    steps:\n      - run: echo "\${{ inputs.source }}"\n`
  const errors = validateRunContextExpressions(source, '.github/workflows/unsafe.yml')
  assert.ok(errors.some((error) => error.includes('${{ inputs.source }}')))
  assert.ok(errors.some((error) => error.includes('pass it through env')))
})

test('rejects every GitHub expression in block run scripts', () => {
  const source = `jobs:\n  test:\n    steps:\n      - shell: bash\n        run: |\n          set -euo pipefail\n          echo "\${{ github.event.pull_request.title }}"\n          echo "\${{ steps.build.outputs.result }}"\n      - shell: bash\n        run: >-\n          set -euo pipefail\n          echo "\${{ secrets.DEPLOY_TOKEN }}"\n`
  const errors = validateRunContextExpressions(source, '.github/workflows/unsafe.yml')
  assert.equal(errors.length, 3)
  assert.ok(errors.some((error) => error.includes('github.event.pull_request.title')))
  assert.ok(errors.some((error) => error.includes('steps.build.outputs.result')))
  assert.ok(errors.some((error) => error.includes('secrets.DEPLOY_TOKEN')))
})

test('requires an explicit Bash shell for multiline run steps', () => {
  const missingShell = SAFE_WORKFLOW.replace('        shell: bash\n', '')
  assert.ok(
    validateRunContextExpressions(missingShell, '.github/workflows/missing-shell.yml').some(
      (error) => error.includes('declare shell: bash'),
    ),
  )

  const wrongShell = SAFE_WORKFLOW.replace('shell: bash', 'shell: sh')
  assert.ok(
    validateRunContextExpressions(wrongShell, '.github/workflows/wrong-shell.yml').some(
      (error) => error.includes('found sh'),
    ),
  )
})

test('requires strict mode as the first effective Bash command', () => {
  const source = SAFE_WORKFLOW.replace('          set -euo pipefail\n', '')
  assert.ok(
    validateRunContextExpressions(source, '.github/workflows/no-strict-mode.yml').some((error) =>
      error.includes('begin with set -euo pipefail'),
    ),
  )
})

test('does not require Bash metadata for single-line run commands', () => {
  const source = `jobs:\n  test:\n    steps:\n      - run: node scripts/check.mjs\n`
  assert.deepEqual(validateRunContextExpressions(source, '.github/workflows/inline.yml'), [])
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

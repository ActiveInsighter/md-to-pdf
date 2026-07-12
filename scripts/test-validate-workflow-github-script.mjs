import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  validateGithubScriptExpressions,
  validateWorkflowGithubScripts,
} from './validate-workflow-github-script.mjs'

const SAFE_WORKFLOW = `name: Safe\n\non:\n  pull_request:\n\npermissions:\n  statuses: write\n\njobs:\n  publish:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Publish status\n        env:\n          JOB_STATUS: \${{ job.status }}\n        uses: actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b\n        with:\n          script: |\n            const status = process.env.JOB_STATUS\n            core.info(status)\n`

test('allows github-script to read GitHub expressions through step environment variables', () => {
  assert.deepEqual(
    validateGithubScriptExpressions(SAFE_WORKFLOW, '.github/workflows/safe.yml'),
    [],
  )
})

test('rejects GitHub expressions interpolated directly into github-script JavaScript', () => {
  const source = SAFE_WORKFLOW.replace(
    'const status = process.env.JOB_STATUS',
    "const status = '\${{ job.status }}'\n            const title = '\${{ github.event.pull_request.title }}'",
  )
  const errors = validateGithubScriptExpressions(source, '.github/workflows/unsafe.yml')
  assert.equal(errors.length, 2)
  assert.ok(errors.some((error) => error.includes('${{ job.status }}')))
  assert.ok(errors.some((error) => error.includes('github.event.pull_request.title')))
  assert.ok(errors.every((error) => error.includes('read process.env')))
})

test('supports shorthand github-script steps and inline script values', () => {
  const source = `jobs:\n  publish:\n    steps:\n      - uses: actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b\n        with:\n          script: core.info('\${{ github.ref }}')\n`
  const errors = validateGithubScriptExpressions(source, '.github/workflows/shorthand.yml')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /github\.ref/)
})

test('ignores script inputs on actions other than actions/github-script', () => {
  const source = SAFE_WORKFLOW.replace(
    'actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b',
    'example/custom-action@0123456789012345678901234567890123456789',
  ).replace('const status = process.env.JOB_STATUS', "const status = '\${{ job.status }}'")
  assert.deepEqual(
    validateGithubScriptExpressions(source, '.github/workflows/custom-action.yml'),
    [],
  )
})

test('directory validation checks both yml and yaml workflow files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-github-script-'))
  try {
    await Promise.all([
      writeFile(path.join(root, 'safe.yml'), SAFE_WORKFLOW),
      writeFile(
        path.join(root, 'unsafe.yaml'),
        SAFE_WORKFLOW.replace('const status = process.env.JOB_STATUS', "const status = '\${{ job.status }}'"),
      ),
    ])
    const errors = await validateWorkflowGithubScripts(root)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /unsafe\.yaml/)
    assert.match(errors[0], /job\.status/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

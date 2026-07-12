import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  discoverWorkflowFiles,
  validateWorkflowText,
} from './validate-workflow-security.mjs'

const SHA = '0123456789abcdef0123456789abcdef01234567'

function workflow({
  permissions = '  contents: read',
  checkout = `actions/checkout@${SHA}`,
  persist = 'false',
  trigger = 'pull_request',
} = {}) {
  return `name: Test\n\non:\n  ${trigger}:\n\npermissions:\n${permissions}\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Checkout\n        uses: ${checkout}\n        with:\n          persist-credentials: ${persist}\n`
}

test('accepts pinned read-only workflows with explicit checkout credentials', () => {
  assert.deepEqual(validateWorkflowText(workflow(), '.github/workflows/test.yml'), [])
})

test('rejects mutable action references and implicit checkout credentials', () => {
  const source = workflow({ checkout: 'actions/checkout@v6' }).replace(
    /\n        with:[\s\S]*$/,
    '\n',
  )
  const errors = validateWorkflowText(source, '.github/workflows/test.yml')
  assert.ok(errors.some((error) => error.includes('40-character commit SHA')))
  assert.ok(errors.some((error) => error.includes('persist-credentials explicitly')))
})

test('rejects missing permissions, unexpected writes and pull_request_target', () => {
  const noPermissions = workflow().replace(/permissions:\n  contents: read\n\n/, '')
  assert.ok(
    validateWorkflowText(noPermissions, '.github/workflows/test.yml').some((error) =>
      error.includes('missing explicit'),
    ),
  )

  assert.ok(
    validateWorkflowText(
      workflow({ permissions: '  contents: write' }),
      '.github/workflows/test.yml',
    ).some((error) => error.includes('unexpected write permission')),
  )

  assert.ok(
    validateWorkflowText(
      workflow({ trigger: 'pull_request_target' }),
      '.github/workflows/test.yml',
    ).some((error) => error.includes('pull_request_target')),
  )
})

test('only the publishing workflow may retain checkout credentials', () => {
  assert.ok(
    validateWorkflowText(
      workflow({ persist: 'true' }),
      '.github/workflows/test.yml',
    ).some((error) => error.includes('may only persist')),
  )
  assert.deepEqual(
    validateWorkflowText(
      workflow({ permissions: '  contents: write', persist: 'true' }),
      '.github/workflows/build-pdf.yml',
    ),
    [],
  )
})

test('discovers every yml and yaml workflow recursively', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-security-'))
  try {
    await mkdir(path.join(root, 'nested'))
    await Promise.all([
      writeFile(path.join(root, 'one.yml'), 'name: one\n'),
      writeFile(path.join(root, 'two.yaml'), 'name: two\n'),
      writeFile(path.join(root, 'nested', 'three.yml'), 'name: three\n'),
      writeFile(path.join(root, 'ignored.txt'), 'name: ignored\n'),
    ])
    assert.deepEqual(await discoverWorkflowFiles(root), [
      path.join(root, 'nested', 'three.yml').split(path.sep).join('/'),
      path.join(root, 'one.yml').split(path.sep).join('/'),
      path.join(root, 'two.yaml').split(path.sep).join('/'),
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

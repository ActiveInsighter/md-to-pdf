import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
  jobPermissions = '',
} = {}) {
  const jobPermissionSection = jobPermissions
    ? `    permissions:${jobPermissions}\n`
    : ''

  return `name: Test\n\non:\n  ${trigger}:\n\npermissions:\n${permissions}\n\njobs:\n  validate:\n    runs-on: ubuntu-24.04\n${jobPermissionSection}    steps:\n      - name: Checkout\n        uses: ${checkout}\n        with:\n          persist-credentials: ${persist}\n`
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
    ).some((error) => error.includes('unexpected top-level write permission')),
  )

  assert.ok(
    validateWorkflowText(
      workflow({ trigger: 'pull_request_target' }),
      '.github/workflows/test.yml',
    ).some((error) => error.includes('pull_request_target')),
  )
})

test('allows job permissions that preserve or reduce top-level access', () => {
  assert.deepEqual(
    validateWorkflowText(
      workflow({
        permissions: '  contents: read\n  statuses: write',
        jobPermissions: '\n      contents: none\n      statuses: read',
      }),
      '.github/workflows/smoke-supabase-service.yml',
    ),
    [],
  )

  assert.deepEqual(
    validateWorkflowText(
      workflow({ jobPermissions: ' {}' }),
      '.github/workflows/test.yml',
    ),
    [],
  )
})

test('rejects job permissions that exceed top-level access', () => {
  const writeErrors = validateWorkflowText(
    workflow({ jobPermissions: '\n      contents: write' }),
    '.github/workflows/test.yml',
  )
  assert.ok(writeErrors.some((error) => error.includes('exceeds top-level read')))

  const newScopeErrors = validateWorkflowText(
    workflow({ jobPermissions: '\n      issues: read' }),
    '.github/workflows/test.yml',
  )
  assert.ok(newScopeErrors.some((error) => error.includes('exceeds top-level none')))
})

test('rejects job permission shorthand that can hide broad access', () => {
  const errors = validateWorkflowText(
    workflow({ jobPermissions: ' write-all' }),
    '.github/workflows/test.yml',
  )
  assert.ok(errors.some((error) => error.includes('explicit map or {}')))
})

test('rejects persisted checkout credentials in every workflow', () => {
  const errors = validateWorkflowText(
    workflow({ permissions: '  contents: write', persist: 'true' }),
    '.github/workflows/cleanup-branches.yml',
  )
  assert.ok(errors.some((error) => error.includes('must not persist')))
})

test('rejects retired repository-backed PDF workflow architecture', () => {
  const retiredPathErrors = validateWorkflowText(
    workflow(),
    '.github/workflows/build-pdf.yml',
  )
  assert.ok(retiredPathErrors.some((error) => error.includes('retired repository-backed PDF workflow')))

  const inboxQueue = workflow().replace(
    '      - name: Checkout',
    '      - name: Consume processed inbox jobs\n        run: node consume.mjs inbox/jobs\n      - name: Checkout',
  )
  const inboxErrors = validateWorkflowText(inboxQueue, '.github/workflows/test.yml')
  assert.ok(inboxErrors.some((error) => error.includes('retired repository inbox queue')))

  const outputPublisher = workflow().replace(
    '      - name: Checkout',
    '      - name: Publish output branch\n        run: git push origin HEAD:refs/heads/output\n      - name: Checkout',
  )
  const outputErrors = validateWorkflowText(outputPublisher, '.github/workflows/test.yml')
  assert.ok(outputErrors.some((error) => error.includes('retired output branch publishing')))
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

test('repository hygiene delegates workflow security to the shared validator', async () => {
  const source = await readFile(
    new URL('../.github/workflows/repository-hygiene.yml', import.meta.url),
    'utf8',
  )

  assert.match(source, /- '\.github\/workflows\/\*\*'/)
  assert.match(source, /run: npm run validate:workflows/)
  assert.doesNotMatch(source, /Mutable or invalid GitHub Action reference/)
  assert.doesNotMatch(source, /read_only_checkouts=\(/)
})

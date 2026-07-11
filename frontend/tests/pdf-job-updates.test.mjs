import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function importTypeScriptModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourceUrl.pathname,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], `Failed to transpile ${relativePath}`)

  const encoded = Buffer.from(result.outputText).toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

const updates = await importTypeScriptModule('../src/utils/pdfJobUpdates.ts')

function job(overrides = {}) {
  return {
    id: 'job-1',
    user_id: 'user-1',
    status: 'queued',
    input_path: 'jobs/job-1/input.md',
    assets_path: null,
    output_path: null,
    has_assets: false,
    theme: 'chatgpt-light',
    options: { breaks: true, toc: true },
    github_run_id: null,
    github_run_url: null,
    error_message: null,
    created_at: '2026-07-11T10:00:00.000Z',
    updated_at: '2026-07-11T10:01:00.000Z',
    started_at: null,
    completed_at: null,
    expires_at: '2026-07-18T10:00:00.000Z',
    ...overrides,
  }
}

test('The first task snapshot is accepted but a different task cannot replace the selection', () => {
  assert.equal(updates.shouldApplyPdfJobUpdate(null, job()), true)
  assert.equal(
    updates.shouldApplyPdfJobUpdate(job(), job({ id: 'job-2' })),
    false,
  )
})

test('A newer timestamp wins and an older polling response is ignored', () => {
  const current = job({ status: 'building', updated_at: '2026-07-11T10:02:00.000Z' })
  assert.equal(
    updates.shouldApplyPdfJobUpdate(
      current,
      job({ status: 'uploading', updated_at: '2026-07-11T10:03:00.000Z' }),
    ),
    true,
  )
  assert.equal(
    updates.shouldApplyPdfJobUpdate(
      current,
      job({ status: 'queued', updated_at: '2026-07-11T10:01:30.000Z' }),
    ),
    false,
  )
})

test('Terminal outcomes are sticky while same-terminal cleanup writes remain visible', () => {
  const completed = job({
    status: 'completed',
    output_path: 'jobs/job-1/output.pdf',
    updated_at: '2026-07-11T10:05:00.000Z',
  })
  assert.equal(
    updates.shouldApplyPdfJobUpdate(
      completed,
      job({ status: 'uploading', updated_at: '2026-07-11T10:06:00.000Z' }),
    ),
    false,
  )
  assert.equal(
    updates.shouldApplyPdfJobUpdate(
      completed,
      { ...completed, input_path: null, updated_at: '2026-07-11T10:06:00.000Z' },
    ),
    true,
  )
})

test('Equal timestamps use status progression as a deterministic fallback', () => {
  const current = job({ status: 'building' })
  assert.equal(
    updates.shouldApplyPdfJobUpdate(current, job({ status: 'uploading' })),
    true,
  )
  assert.equal(
    updates.shouldApplyPdfJobUpdate(current, job({ status: 'queued' })),
    false,
  )
  assert.equal(
    updates.shouldApplyPdfJobUpdate(current, job({ status: 'failed' })),
    true,
  )
})

test('Valid timestamps take precedence over malformed timestamps', () => {
  assert.equal(
    updates.shouldApplyPdfJobUpdate(
      job({ updated_at: 'invalid' }),
      job({ updated_at: '2026-07-11T10:02:00.000Z' }),
    ),
    true,
  )
  assert.equal(
    updates.shouldApplyPdfJobUpdate(
      job({ updated_at: '2026-07-11T10:02:00.000Z' }),
      job({ status: 'building', updated_at: 'invalid' }),
    ),
    false,
  )
})

test('History merging preserves a fresher local snapshot over an older list response', () => {
  const current = job({ status: 'building', updated_at: '2026-07-11T10:04:00.000Z' })
  const incoming = job({ status: 'queued', updated_at: '2026-07-11T10:03:00.000Z' })
  assert.deepEqual(updates.mergePdfJobHistory([current], [incoming]), [current])
})

test('History merging keeps tasks created after an older list request started', () => {
  const newest = job({
    id: 'job-new',
    created_at: '2026-07-11T10:05:00.000Z',
    updated_at: '2026-07-11T10:05:00.000Z',
  })
  const older = job({
    id: 'job-old',
    created_at: '2026-07-11T10:00:00.000Z',
    updated_at: '2026-07-11T10:02:00.000Z',
  })
  assert.deepEqual(updates.mergePdfJobHistory([newest], [older]), [newest, older])
})

test('History merging applies newer rows, sorts deterministically and enforces the limit', () => {
  const current = job({ status: 'queued' })
  const updated = job({ status: 'building', updated_at: '2026-07-11T10:03:00.000Z' })
  const newest = job({
    id: 'job-2',
    created_at: '2026-07-11T11:00:00.000Z',
    updated_at: '2026-07-11T11:00:00.000Z',
  })
  assert.deepEqual(updates.mergePdfJobHistory([current], [updated, newest], 1), [newest])
  assert.equal(updates.mergePdfJobHistory([current], [updated])[0].status, 'building')
  assert.deepEqual(updates.mergePdfJobHistory([current], [updated], 0), [])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergePdfJobHistory,
  shouldApplyPdfJobUpdate,
} from '../src/features/pdf-jobs/hooks/cache.ts'

function job(overrides = {}) {
  return {
    id: 'job-1',
    user_id: 'user-1',
    status: 'queued',
    input_path: 'jobs/job-1/input.md',
    assets_path: null,
    output_path: null,
    source_filename: 'notes.md',
    document_name: 'notes',
    has_assets: false,
    theme: 'chatgpt-light',
    options: { breaks: true, toc: true },
    github_run_id: null,
    github_run_url: null,
    error_message: null,
    is_favorite: false,
    created_at: '2026-07-11T10:00:00.000Z',
    updated_at: '2026-07-11T10:01:00.000Z',
    started_at: null,
    completed_at: null,
    expires_at: '2026-07-18T10:00:00.000Z',
    ...overrides,
  }
}

test('The first task snapshot is accepted but a different task cannot replace the selection', () => {
  assert.equal(shouldApplyPdfJobUpdate(null, job()), true)
  assert.equal(shouldApplyPdfJobUpdate(job(), job({ id: 'job-2' })), false)
})

test('A newer timestamp wins and an older polling response is ignored', () => {
  const current = job({ status: 'building', updated_at: '2026-07-11T10:02:00.000Z' })
  assert.equal(shouldApplyPdfJobUpdate(current, job({ status: 'uploading', updated_at: '2026-07-11T10:03:00.000Z' })), true)
  assert.equal(shouldApplyPdfJobUpdate(current, job({ status: 'queued', updated_at: '2026-07-11T10:01:30.000Z' })), false)
})

test('Terminal outcomes are sticky while same-terminal cleanup writes remain visible', () => {
  const completed = job({
    status: 'completed',
    output_path: 'jobs/job-1/output.pdf',
    updated_at: '2026-07-11T10:05:00.000Z',
  })
  assert.equal(shouldApplyPdfJobUpdate(completed, job({ status: 'uploading', updated_at: '2026-07-11T10:06:00.000Z' })), false)
  assert.equal(shouldApplyPdfJobUpdate(completed, { ...completed, input_path: null, updated_at: '2026-07-11T10:06:00.000Z' }), true)
})

test('Equal timestamps use status progression as a deterministic fallback', () => {
  const current = job({ status: 'building' })
  assert.equal(shouldApplyPdfJobUpdate(current, job({ status: 'uploading' })), true)
  assert.equal(shouldApplyPdfJobUpdate(current, job({ status: 'queued' })), false)
  assert.equal(shouldApplyPdfJobUpdate(current, job({ status: 'failed' })), true)
})

test('Valid timestamps take precedence over malformed timestamps', () => {
  assert.equal(shouldApplyPdfJobUpdate(job({ updated_at: 'invalid' }), job({ updated_at: '2026-07-11T10:02:00.000Z' })), true)
  assert.equal(shouldApplyPdfJobUpdate(job({ updated_at: '2026-07-11T10:02:00.000Z' }), job({ status: 'building', updated_at: 'invalid' })), false)
})

test('History merging preserves a fresher local snapshot over an older list response', () => {
  const current = job({ status: 'building', updated_at: '2026-07-11T10:04:00.000Z' })
  const incoming = job({ status: 'queued', updated_at: '2026-07-11T10:03:00.000Z' })
  assert.deepEqual(mergePdfJobHistory([current], [incoming]), [current])
})

test('History merging keeps tasks created after an older list request started', () => {
  const newest = job({ id: 'job-new', created_at: '2026-07-11T10:05:00.000Z', updated_at: '2026-07-11T10:05:00.000Z' })
  const older = job({ id: 'job-old', created_at: '2026-07-11T10:00:00.000Z', updated_at: '2026-07-11T10:02:00.000Z' })
  assert.deepEqual(mergePdfJobHistory([newest], [older]), [newest, older])
})

test('History merging applies newer rows, sorts deterministically and enforces the limit', () => {
  const current = job({ status: 'queued' })
  const updated = job({ status: 'building', updated_at: '2026-07-11T10:03:00.000Z' })
  const newest = job({ id: 'job-2', created_at: '2026-07-11T11:00:00.000Z', updated_at: '2026-07-11T11:00:00.000Z' })
  assert.deepEqual(mergePdfJobHistory([current], [updated, newest], 1), [newest])
  assert.equal(mergePdfJobHistory([current], [updated])[0].status, 'building')
  assert.deepEqual(mergePdfJobHistory([current], [updated], 0), [])
})

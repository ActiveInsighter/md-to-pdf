import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SAFE_EXPIRABLE_STATUSES,
  cleanupObjectPaths,
  configureCandidateQuery,
} from './lib/pdf-job-cleanup.mjs'

test('cleanup candidates exclude every active build status', () => {
  assert.deepEqual(SAFE_EXPIRABLE_STATUSES, [
    'created', 'uploaded', 'completed', 'failed', 'cancelled',
  ])
  for (const active of ['queued', 'building', 'uploading']) {
    assert.equal(SAFE_EXPIRABLE_STATUSES.includes(active), false)
  }
})

test('cleanup only removes canonical paths belonging to the selected job', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000'
  assert.deepEqual(cleanupObjectPaths({
    id,
    input_path: `jobs/${id}/input.md`,
    assets_path: null,
    output_path: `jobs/${id}/output.pdf`,
  }), [`jobs/${id}/input.md`, `jobs/${id}/output.pdf`])
  assert.throws(() => cleanupObjectPaths({
    id,
    input_path: 'jobs/another-job/input.md',
  }), /unexpected Storage path/)
})

test('candidate queries use keyset pagination and separate retry mode', () => {
  const cutoff = '2026-07-13T00:00:00.000Z'
  const candidates = configureCandidateQuery(new URL('https://example.test/pdf_jobs'), {
    cutoff,
    lastId: '10000000-0000-4000-8000-000000000000',
  })
  assert.equal(candidates.searchParams.get('is_favorite'), 'eq.false')
  assert.match(candidates.searchParams.get('status'), /cancelled/)
  assert.equal(candidates.searchParams.get('id'), 'gt.10000000-0000-4000-8000-000000000000')

  const retry = configureCandidateQuery(new URL('https://example.test/pdf_jobs'), {
    cutoff,
    retryExpired: true,
  })
  assert.equal(retry.searchParams.get('status'), 'eq.expired')
  assert.match(retry.searchParams.get('or'), /output_path\.not\.is\.null/)
  assert.equal(retry.searchParams.has('is_favorite'), false)
})

import assert from 'node:assert/strict'
import test from 'node:test'

const cancellation = await import('../../supabase/functions/cancel-pdf-job/logic.ts')

function job(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    user_id: 'user-1',
    status: 'created',
    input_path: 'jobs/test/input.md',
    assets_path: 'jobs/test/assets.zip',
    ...overrides,
  }
}

test('Cancellation validates UUIDs before accessing task data', () => {
  assert.equal(cancellation.isValidJobId('550e8400-e29b-41d4-a716-446655440000'), true)
  assert.equal(cancellation.isValidJobId('not-a-job-id'), false)
  assert.equal(cancellation.isValidJobId('550e8400-e29b-71d4-a716-446655440000'), false)
})

test('Cancellation decisions hide foreign tasks and distinguish safe states', () => {
  assert.deepEqual(cancellation.decideCancellation('user-1', null), { kind: 'not-found' })
  assert.deepEqual(cancellation.decideCancellation('user-2', job()), { kind: 'not-found' })

  assert.equal(cancellation.decideCancellation('user-1', job()).kind, 'cancel')
  assert.equal(cancellation.decideCancellation('user-1', job({ status: 'uploaded' })).kind, 'cancel')
  assert.deepEqual(
    cancellation.decideCancellation('user-1', job({ status: 'queued' })),
    { kind: 'conflict', status: 'queued' },
  )

  const cancelled = job({ status: 'cancelled' })
  const repeated = cancellation.decideCancellation('user-1', cancelled)
  assert.equal(repeated.kind, 'idempotent')
  assert.equal(repeated.job, cancelled)
})

test('A missed conditional update only accepts an already-cancelled race winner', () => {
  const cancelled = job({ status: 'cancelled' })
  assert.equal(cancellation.resolveCancellationRace('user-1', cancelled).kind, 'idempotent')
  assert.deepEqual(
    cancellation.resolveCancellationRace('user-1', job({ status: 'building' })),
    { kind: 'conflict', status: 'building' },
  )
  assert.deepEqual(
    cancellation.resolveCancellationRace('user-2', job()),
    { kind: 'not-found' },
  )
})

test('Cancelled task cleanup reports storage and path persistence failures', async () => {
  const calls = []
  const success = await cancellation.cleanupCancelledJob(job(), {
    async removeObjects(paths) {
      calls.push(['remove', paths])
      return null
    },
    async clearPaths(jobId) {
      calls.push(['clear', jobId])
      return null
    },
  })
  assert.deepEqual(success, {
    cleanupPending: false,
    storageError: null,
    clearPathsError: null,
  })
  assert.deepEqual(calls, [
    ['remove', ['jobs/test/input.md', 'jobs/test/assets.zip']],
    ['clear', '550e8400-e29b-41d4-a716-446655440000'],
  ])

  let clearCalled = false
  const storageFailure = await cancellation.cleanupCancelledJob(job(), {
    async removeObjects() {
      return 'storage unavailable'
    },
    async clearPaths() {
      clearCalled = true
      return null
    },
  })
  assert.equal(storageFailure.cleanupPending, true)
  assert.equal(storageFailure.storageError, 'storage unavailable')
  assert.equal(clearCalled, false)

  const pathFailure = await cancellation.cleanupCancelledJob(job(), {
    async removeObjects() {
      return null
    },
    async clearPaths() {
      return 'database unavailable'
    },
  })
  assert.deepEqual(pathFailure, {
    cleanupPending: true,
    storageError: null,
    clearPathsError: 'database unavailable',
  })

  const noObjects = await cancellation.cleanupCancelledJob(
    job({ input_path: null, assets_path: null }),
    {
      async removeObjects() {
        throw new Error('removeObjects must not run')
      },
      async clearPaths() {
        throw new Error('clearPaths must not run')
      },
    },
  )
  assert.equal(noObjects.cleanupPending, false)
})

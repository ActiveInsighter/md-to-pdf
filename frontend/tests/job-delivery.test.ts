import test from 'node:test'
import assert from 'node:assert/strict'
import { runActiveJobDelivery, shouldDeliverJobCompletion } from '../src/features/pdf-jobs/delivery'

const activeStatuses = ['created', 'uploaded', 'queued', 'building', 'uploading'] as const

test('opening an already completed task never triggers delivery', () => {
  assert.equal(shouldDeliverJobCompletion(null, { id: 'job-1', status: 'completed' }), false)
  assert.equal(shouldDeliverJobCompletion(undefined, { id: 'job-1', status: 'completed' }), false)
})

test('delivery only triggers when the same active task becomes completed', () => {
  for (const status of activeStatuses) {
    assert.equal(
      shouldDeliverJobCompletion({ id: 'job-1', status }, { id: 'job-1', status: 'completed' }),
      true,
    )
  }
})

test('completed refreshes, route changes and terminal transitions do not trigger delivery', () => {
  assert.equal(
    shouldDeliverJobCompletion({ id: 'job-1', status: 'completed' }, { id: 'job-1', status: 'completed' }),
    false,
  )
  assert.equal(
    shouldDeliverJobCompletion({ id: 'job-1', status: 'building' }, { id: 'job-2', status: 'completed' }),
    false,
  )
  assert.equal(
    shouldDeliverJobCompletion({ id: 'job-1', status: 'failed' }, { id: 'job-1', status: 'completed' }),
    false,
  )
  assert.equal(
    shouldDeliverJobCompletion({ id: 'job-1', status: 'cancelled' }, { id: 'job-1', status: 'completed' }),
    false,
  )
  assert.equal(
    shouldDeliverJobCompletion({ id: 'job-1', status: 'expired' }, { id: 'job-1', status: 'completed' }),
    false,
  )
})

test('an inactive delivery suppresses both download commits and error toasts', async () => {
  let active = true
  let resolveDownload: ((value: string) => void) | undefined
  const download = new Promise<string>((resolve) => { resolveDownload = resolve })
  const committed: string[] = []
  const rejected: unknown[] = []
  const pending = runActiveJobDelivery(
    () => download,
    (value) => committed.push(value),
    (error) => rejected.push(error),
    () => active,
  )

  active = false
  resolveDownload?.('signed-url')
  await pending
  assert.deepEqual(committed, [])
  assert.deepEqual(rejected, [])

  await runActiveJobDelivery(
    async () => { throw new Error('late failure') },
    (value) => committed.push(value),
    (error) => rejected.push(error),
    () => active,
  )
  assert.deepEqual(rejected, [])
})

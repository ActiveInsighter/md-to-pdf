import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORKFLOW_EXPECTED_STATUSES,
  WORKFLOW_TERMINAL_STATUSES,
  isIdempotentStatus,
  isLegacyServiceRoleKey,
  postgrestStatusFilter,
  serviceKeyHeaders,
} from './lib/supabase-service-request.mjs'

test('new secret API keys are sent only as apikey headers', () => {
  const headers = serviceKeyHeaders('sb_secret_test_value', { Accept: 'application/json' })
  assert.deepEqual(headers, {
    apikey: 'sb_secret_test_value',
    Accept: 'application/json',
  })
  assert.equal(isLegacyServiceRoleKey('sb_secret_test_value'), false)
})

test('legacy service-role JWTs retain the bearer header', () => {
  const headers = serviceKeyHeaders('legacy-service-role-token')
  assert.deepEqual(headers, {
    apikey: 'legacy-service-role-token',
    Authorization: 'Bearer legacy-service-role-token',
  })
  assert.equal(isLegacyServiceRoleKey('legacy-service-role-token'), true)
})

test('PostgREST expected-status filters are deduplicated and validated', () => {
  assert.equal(postgrestStatusFilter(['queued']), 'in.(queued)')
  assert.equal(postgrestStatusFilter(['building', 'uploading', 'building']), 'in.(building,uploading)')
  assert.throws(() => postgrestStatusFilter([]), /expected status/i)
  assert.throws(() => postgrestStatusFilter(['building)']), /invalid value/i)
})

test('terminal idempotency is explicit', () => {
  assert.deepEqual(WORKFLOW_EXPECTED_STATUSES, {
    building: ['queued'],
    progress: ['building'],
    uploading: ['building'],
    completed: ['uploading'],
    failed: ['queued', 'building', 'uploading'],
  })
  assert.equal(isIdempotentStatus('completed', WORKFLOW_TERMINAL_STATUSES), true)
  assert.equal(isIdempotentStatus('building', WORKFLOW_TERMINAL_STATUSES), false)
})

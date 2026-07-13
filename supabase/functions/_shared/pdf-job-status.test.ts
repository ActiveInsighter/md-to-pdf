import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  PDF_JOB_PENDING_INPUT_STATUSES as FRONTEND_PENDING_INPUT_STATUSES,
  PDF_JOB_STATUSES as FRONTEND_STATUSES,
  PDF_JOB_TERMINAL_STATUSES as FRONTEND_TERMINAL_STATUSES,
} from '../../../frontend/src/features/pdf-jobs/types.ts'
import {
  PDF_JOB_ACTIVE_STATUSES,
  PDF_JOB_PENDING_INPUT_STATUSES,
  PDF_JOB_START_FAILURE_STATUSES,
  PDF_JOB_START_IDEMPOTENT_STATUSES,
  PDF_JOB_STATUSES,
  PDF_JOB_TERMINAL_STATUSES,
  isPdfJobStatus,
  isPendingInputPdfJobStatus,
  isStartIdempotentPdfJobStatus,
} from './pdf-job-status.ts'

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

test('frontend, Edge Functions and database expose the same job statuses', async () => {
  assert.deepEqual(PDF_JOB_STATUSES, FRONTEND_STATUSES)

  const migration = await readFile(
    new URL('../../migrations/20260711123000_create_pdf_jobs.sql', import.meta.url),
    'utf8',
  )
  const check = migration.match(/check \(status in \(([^)]+)\)\)/)
  assert.ok(check, 'pdf_jobs status check constraint was not found')
  const databaseStatuses = [...check[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(databaseStatuses, PDF_JOB_STATUSES)
})

test('frontend and Edge Functions agree on terminal and pending-input states', () => {
  assert.deepEqual(PDF_JOB_TERMINAL_STATUSES, FRONTEND_TERMINAL_STATUSES)
  assert.deepEqual(PDF_JOB_PENDING_INPUT_STATUSES, FRONTEND_PENDING_INPUT_STATUSES)
})

test('status categories form a complete non-overlapping protocol partition', () => {
  const partition = [
    ...PDF_JOB_PENDING_INPUT_STATUSES,
    ...PDF_JOB_ACTIVE_STATUSES,
    ...PDF_JOB_TERMINAL_STATUSES,
  ]
  assert.deepEqual(unique(partition), PDF_JOB_STATUSES)
  assert.equal(partition.length, PDF_JOB_STATUSES.length)
})

test('start and cancellation helpers classify only supported states', () => {
  for (const status of PDF_JOB_STATUSES) {
    assert.equal(isPdfJobStatus(status), true)
    assert.equal(
      isPendingInputPdfJobStatus(status),
      PDF_JOB_PENDING_INPUT_STATUSES.includes(
        status as (typeof PDF_JOB_PENDING_INPUT_STATUSES)[number],
      ),
    )
    assert.equal(
      isStartIdempotentPdfJobStatus(status),
      PDF_JOB_START_IDEMPOTENT_STATUSES.includes(
        status as (typeof PDF_JOB_START_IDEMPOTENT_STATUSES)[number],
      ),
    )
  }

  assert.deepEqual(PDF_JOB_START_FAILURE_STATUSES, ['uploaded', 'queued'])
  assert.equal(isPdfJobStatus('unknown'), false)
  assert.equal(isPendingInputPdfJobStatus('failed'), false)
  assert.equal(isStartIdempotentPdfJobStatus('expired'), false)
})

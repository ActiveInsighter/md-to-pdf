import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
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

  const migrationsUrl = new URL('../../migrations/', import.meta.url)
  const migrationFiles = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const migrations = await Promise.all(
    migrationFiles.map((name) => readFile(new URL(name, migrationsUrl), 'utf8')),
  )
  const lifecycleMigration = migrations.find((source) =>
    source.includes('add constraint pdf_jobs_status_check')
  )
  assert.ok(lifecycleMigration, 'hardened pdf_jobs status migration was not found')
  const check = lifecycleMigration.match(
    /add constraint pdf_jobs_status_check\s+check\s*\(\s*status in\s*\(([^)]+)\)/,
  )
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
  assert.equal(isPendingInputPdfJobStatus('cancelled'), false)
  assert.equal(isStartIdempotentPdfJobStatus('expired'), false)
})

test('database lifecycle hardening prevents terminal resurrection and premature completion', async () => {
  const migrationsUrl = new URL('../../migrations/', import.meta.url)
  const migrationFiles = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith('_harden_pdf_job_lifecycle.sql'))
  assert.equal(migrationFiles.length, 1)

  const migration = await readFile(new URL(migrationFiles[0], migrationsUrl), 'utf8')
  const legacyCancellation = migration.indexOf("error_message = '用户已取消未启动任务。'")
  const transitionGuard = migration.indexOf('create trigger enforce_pdf_job_status_transition')
  assert.ok(legacyCancellation >= 0, 'legacy failed cancellations are not normalized')
  assert.ok(
    legacyCancellation < transitionGuard,
    'legacy cancellations must be normalized before the transition guard is installed',
  )
  assert.match(migration, /old\.status in \('completed', 'failed', 'cancelled'\) and new\.status = 'expired'/)
  assert.match(migration, /and status = 'uploading';/)
  assert.doesNotMatch(migration, /update storage\.buckets/)
})

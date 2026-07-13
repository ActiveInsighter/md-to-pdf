import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  MAX_ASSETS_BYTES,
  MAX_MARKDOWN_BYTES,
  getSubmissionRecovery,
  validateAssetsFile,
  validateMarkdownFile,
} from '../src/features/pdf-builder/lib/files.ts'
import {
  getJobDisplayStatus,
  getJobStatusLabel,
  isTerminalJob,
} from '../src/features/pdf-jobs/status.ts'
import { formatFileSize } from '../src/lib/utils.ts'

function file(name, size) {
  return { name, size }
}

function job(status, patch = {}) {
  return {
    id: 'job-1',
    status,
    input_path: 'jobs/job-1/input.md',
    assets_path: null,
    has_assets: false,
    source_filename: 'notes.md',
    document_name: 'notes',
    error_message: null,
    ...patch,
  }
}

test('Markdown validation accepts case-insensitive extensions at the size limit', () => {
  assert.equal(validateMarkdownFile(file('NOTES.MD', MAX_MARKDOWN_BYTES)), null)
})

test('Markdown validation rejects empty, oversized and incorrectly named files', () => {
  assert.equal(validateMarkdownFile(file('empty.md', 0)), 'Markdown 文件不能为空。')
  assert.equal(validateMarkdownFile(file('large.md', MAX_MARKDOWN_BYTES + 1)), 'Markdown 文件不能超过 10 MiB。')
  assert.equal(validateMarkdownFile(file('notes.txt', 1024)), '请选择扩展名为 .md 的 Markdown 文件。')
})

test('Assets validation accepts ZIP files and enforces boundary conditions', () => {
  assert.equal(validateAssetsFile(file('ASSETS.ZIP', MAX_ASSETS_BYTES)), null)
  assert.equal(validateAssetsFile(file('empty.zip', 0)), '资源压缩包不能为空。')
  assert.equal(validateAssetsFile(file('large.zip', MAX_ASSETS_BYTES + 1)), '资源压缩包不能超过 50 MiB。')
  assert.equal(validateAssetsFile(file('assets.tar', 1024)), '请选择扩展名为 .zip 的资源压缩包。')
})

test('File sizes are formatted consistently at unit boundaries', () => {
  assert.equal(formatFileSize(0), '0 B')
  assert.equal(formatFileSize(1023), '1023 B')
  assert.equal(formatFileSize(1024), '1.0 KiB')
  assert.equal(formatFileSize(1024 * 1024), '1.0 MiB')
})

test('Backend statuses map to the unified task display model', () => {
  assert.equal(getJobDisplayStatus(job('uploaded')), 'uploading')
  assert.equal(getJobDisplayStatus(job('building')), 'running')
  assert.equal(getJobDisplayStatus(job('failed', { error_message: 'Task cancelled by user' })), 'cancelled')
  assert.equal(getJobStatusLabel(job('completed')), '已完成')
  assert.equal(isTerminalJob(job('failed')), true)
  assert.equal(isTerminalJob(job('queued')), false)
})

test('Submission recovery only accepts reusable jobs with valid storage paths', () => {
  assert.deepEqual(getSubmissionRecovery(job('created', {
    assets_path: 'jobs/job-1/assets.zip',
    has_assets: true,
  })), {
    jobId: 'job-1',
    status: 'created',
    inputPath: 'jobs/job-1/input.md',
    assetsPath: 'jobs/job-1/assets.zip',
    hasAssets: true,
    sourceFilename: 'notes.md',
    documentName: 'notes',
  })
  assert.equal(getSubmissionRecovery(job('created', { has_assets: true })), null)
  assert.equal(getSubmissionRecovery(job('failed')), null)
})

test('Realtime health keeps polling fallback and terminal stop rules in Query hooks', async () => {
  const detailHook = await readFile(new URL('../src/features/pdf-jobs/hooks/usePdfJob.ts', import.meta.url), 'utf8')
  const listHook = await readFile(new URL('../src/features/pdf-jobs/hooks/usePdfJobs.ts', import.meta.url), 'utf8')
  assert.match(detailHook, /realtimeConnection === 'connected' \? 30_000 : 4_000/)
  assert.match(detailHook, /isTerminalJob\(job\)/)
  assert.match(listHook, /realtimeConnection === 'connected' \? 30_000 : 5_000/)
})

test('Pending job cancellation keeps user scoping and JWT protection', async () => {
  const source = await readFile(new URL('../../supabase/functions/cancel-pdf-job/index.ts', import.meta.url), 'utf8')
  assert.match(source, /decideCancellation\(user\.id/)
  assert.match(source, /resolveCancellationRace\(user\.id/)
  assert.match(source, /cleanupCancelledJob\(job/)
  assert.match(source, /\.eq\('user_id', user\.id\)/)
  assert.match(source, /PDF_JOB_PENDING_INPUT_STATUSES/)

  const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
  assert.match(config, /\[functions\.cancel-pdf-job\]\s+verify_jwt = true/)
})

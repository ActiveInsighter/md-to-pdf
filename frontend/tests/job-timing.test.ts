import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDuration, formatElapsedClock, getJobElapsedMilliseconds, getJobFlowSteps, getJobTimingSummary } from '../src/features/pdf-jobs/timing'
import type { PdfJob } from '../src/features/pdf-jobs/types'

function job(status: PdfJob['status'], patch: Partial<PdfJob> = {}): PdfJob {
  return {
    id: 'job-1',
    user_id: 'user-1',
    status,
    input_path: null,
    assets_path: null,
    output_path: null,
    source_filename: 'notes.md',
    document_name: 'notes',
    has_assets: false,
    theme: 'chatgpt-light',
    options: {},
    github_run_id: null,
    github_run_url: null,
    error_message: null,
    is_favorite: false,
    created_at: '2026-07-13T00:00:00.000Z',
    updated_at: '2026-07-13T00:03:30.000Z',
    started_at: '2026-07-13T00:01:00.000Z',
    completed_at: null,
    expires_at: '2026-08-13T00:00:00.000Z',
    ...patch,
  }
}

test('duration formatting is stable across time units', () => {
  assert.equal(formatDuration(0), '<1 秒')
  assert.equal(formatDuration(12_000), '12 秒')
  assert.equal(formatDuration(188_000), '3 分 08 秒')
  assert.equal(formatDuration(3_720_000), '1 小时 02 分')
  assert.equal(formatDuration(97_200_000), '1 天 3 小时')
  assert.equal(formatElapsedClock(0), '+00:00')
  assert.equal(formatElapsedClock(188_000), '+03:08')
  assert.equal(formatElapsedClock(null), '--:--')
})

test('task timing covers the same lifecycle as milestone timing', () => {
  const active = job('building')
  assert.equal(getJobElapsedMilliseconds(active, Date.parse('2026-07-13T00:04:00.000Z')), 240_000)
  assert.deepEqual(getJobTimingSummary(active, Date.parse('2026-07-13T00:04:00.000Z')), { label: '已用时', value: '4 分 00 秒' })

  const completed = job('completed', { completed_at: '2026-07-13T00:05:10.000Z' })
  assert.equal(getJobElapsedMilliseconds(completed), 310_000)
  assert.deepEqual(getJobTimingSummary(completed), { label: '总耗时', value: '5 分 10 秒' })
  assert.equal(getJobFlowSteps(completed).at(-1)?.elapsedMilliseconds, 310_000)
})

test('flow exposes every milestone with elapsed timestamps and states', () => {
  const steps = getJobFlowSteps(job('uploading', {
    uploaded_at: '2026-07-13T00:00:30.000Z',
    queued_at: '2026-07-13T00:00:40.000Z',
    rendering_at: '2026-07-13T00:02:00.000Z',
    uploading_at: '2026-07-13T00:03:00.000Z',
  }), Date.parse('2026-07-13T00:03:30.000Z'))

  assert.deepEqual(steps.map((step) => step.key), ['created', 'uploaded', 'queued', 'started', 'rendering', 'uploading', 'completed'])
  assert.equal(steps.find((step) => step.key === 'uploaded')?.elapsedMilliseconds, 30_000)
  assert.equal(steps.find((step) => step.key === 'uploading')?.elapsedMilliseconds, 180_000)
  assert.equal(steps.find((step) => step.key === 'uploading')?.state, 'active')
  assert.equal(steps.at(-1)?.state, 'pending')
})

test('cancelled jobs use their terminal update for timing and flow', () => {
  const cancelled = job('cancelled', {
    started_at: null,
    updated_at: '2026-07-13T00:02:00.000Z',
  })
  assert.equal(getJobElapsedMilliseconds(cancelled), 120_000)
  assert.deepEqual(getJobTimingSummary(cancelled), { label: '总耗时', value: '2 分 00 秒' })
  assert.deepEqual(getJobFlowSteps(cancelled).at(-1), {
    key: 'cancelled',
    label: '任务取消',
    at: '2026-07-13T00:02:00.000Z',
    elapsedMilliseconds: 120_000,
    state: 'error',
  })
})

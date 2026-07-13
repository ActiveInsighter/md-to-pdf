import test from 'node:test'
import assert from 'node:assert/strict'
import { canCancelJob, canDownloadJob, getJobDisplayStatus, getJobProgress, getJobStageDescription, getJobStatusLabel, isTerminalJob } from '../src/features/pdf-jobs/status'
import type { PdfJob } from '../src/features/pdf-jobs/types'

function job(status: PdfJob['status'], patch: Partial<PdfJob> = {}): PdfJob {
  return {
    id: 'job', user_id: 'user', status, input_path: null, assets_path: null, output_path: null,
    source_filename: 'test.md', document_name: 'test', has_assets: false, theme: 'chatgpt-light', options: {},
    github_run_id: null, github_run_url: null, error_message: null, is_favorite: false,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), started_at: null,
    completed_at: null, expires_at: new Date(Date.now() + 60_000).toISOString(), ...patch,
  }
}

test('server statuses map to distinct UI lifecycle stages', () => {
  assert.equal(getJobDisplayStatus(job('uploaded')), 'uploaded')
  assert.equal(getJobDisplayStatus(job('building')), 'running')
  assert.equal(getJobDisplayStatus(job('uploading')), 'uploading')
  assert.equal(getJobDisplayStatus(job('cancelled')), 'cancelled')
  assert.equal(getJobStatusLabel(job('uploaded')), '已上传')
  assert.equal(getJobStatusLabel(job('uploading')), '上传 PDF 中')
  assert.equal(getJobStatusLabel(job('cancelled')), '已取消')
  assert.equal(getJobStatusLabel(job('completed')), '已完成')
})

test('machine progress tokens fall back to readable Chinese descriptions', () => {
  assert.equal(getJobStageDescription(job('completed', { progress_stage: 'completed' })), 'PDF 已生成，可以下载')
  assert.equal(getJobStageDescription(job('building', { progress_stage: 'rendering' })), '正在渲染文档与生成 PDF')
  assert.equal(getJobStageDescription(job('building', { progress_stage: '正在处理第 4 页' })), '正在处理第 4 页')
})

test('status capabilities are centralized', () => {
  assert.equal(canCancelJob(job('created')), true)
  assert.equal(canCancelJob(job('uploaded')), true)
  assert.equal(canCancelJob(job('queued')), false)
  assert.equal(canDownloadJob(job('completed')), true)
  assert.equal(canDownloadJob(job('expired')), false)
  assert.equal(isTerminalJob(job('failed')), true)
  assert.equal(isTerminalJob(job('cancelled')), true)
  assert.equal(getJobProgress(job('building', { progress_percent: 73 })), 73)
})

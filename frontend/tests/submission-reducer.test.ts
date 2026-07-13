import test from 'node:test'
import assert from 'node:assert/strict'
import { initialSubmissionState, submissionReducer, getSubmissionProgress, getSubmissionLabel } from '../src/features/pdf-builder/submissionReducer'

test('submission reducer separates source preparation from build submission', () => {
  const creating = submissionReducer(initialSubmissionState, { type: 'CREATING' })
  assert.deepEqual(creating, { status: 'creating', progress: 8 })
  const markdown = submissionReducer(creating, { type: 'UPLOADING_MARKDOWN', jobId: 'job-1' })
  assert.equal(markdown.status, 'uploading-markdown')
  const assets = submissionReducer(markdown, { type: 'UPLOADING_ASSETS', jobId: 'job-1' })
  assert.equal(getSubmissionProgress(assets), 70)
  const prepared = submissionReducer(assets, { type: 'PREPARED', jobId: 'job-1' })
  assert.deepEqual(prepared, { status: 'prepared', jobId: 'job-1', progress: 100 })
  assert.equal(getSubmissionLabel(prepared), '文件已上传，等待生成 PDF')
  const starting = submissionReducer(prepared, { type: 'STARTING', jobId: 'job-1' })
  const submitted = submissionReducer(starting, { type: 'SUBMITTED', jobId: 'job-1' })
  assert.deepEqual(submitted, { status: 'submitted', jobId: 'job-1' })
  assert.equal(getSubmissionProgress(submitted), 100)
})

test('failed state carries recovery context without serializing files', () => {
  const failed = submissionReducer(initialSubmissionState, { type: 'FAILED', jobId: 'job-2', message: '上传失败', recoverable: true })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.recoverable, true)
  assert.equal('file' in failed, false)
})

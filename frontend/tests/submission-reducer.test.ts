import test from 'node:test'
import assert from 'node:assert/strict'
import { initialSubmissionState, submissionReducer, getSubmissionProgress } from '../src/features/pdf-builder/submissionReducer'

test('submission reducer follows a legal upload sequence', () => {
  const creating = submissionReducer(initialSubmissionState, { type: 'CREATING' })
  assert.deepEqual(creating, { status: 'creating', progress: 5 })
  const markdown = submissionReducer(creating, { type: 'UPLOADING_MARKDOWN', jobId: 'job-1' })
  assert.equal(markdown.status, 'uploading-markdown')
  const assets = submissionReducer(markdown, { type: 'UPLOADING_ASSETS', jobId: 'job-1' })
  assert.equal(getSubmissionProgress(assets), 55)
  const starting = submissionReducer(assets, { type: 'STARTING', jobId: 'job-1' })
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

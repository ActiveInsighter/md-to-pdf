import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function importTypeScriptModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourceUrl.pathname,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )

  assert.deepEqual(errors, [], `Failed to transpile ${relativePath}`)

  const encoded = Buffer.from(result.outputText).toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

const uploadFiles = await importTypeScriptModule('../src/utils/uploadFiles.ts')
const pdfJobStatus = await importTypeScriptModule('../src/utils/pdfJobStatus.ts')
const realtimePolling = await importTypeScriptModule('../src/utils/realtimePolling.ts')

function file(name, size) {
  return { name, size }
}

test('Markdown validation accepts case-insensitive extensions at the size limit', () => {
  assert.equal(
    uploadFiles.validateMarkdownFile(file('NOTES.MD', uploadFiles.MAX_MARKDOWN_BYTES)),
    null,
  )
})

test('Markdown validation rejects empty, oversized and incorrectly named files', () => {
  assert.equal(uploadFiles.validateMarkdownFile(file('empty.md', 0)), 'Markdown 文件不能为空。')
  assert.equal(
    uploadFiles.validateMarkdownFile(file('large.md', uploadFiles.MAX_MARKDOWN_BYTES + 1)),
    'Markdown 文件不能超过 10 MiB。',
  )
  assert.equal(
    uploadFiles.validateMarkdownFile(file('notes.txt', 1024)),
    '请选择扩展名为 .md 的 Markdown 文件。',
  )
})

test('Assets validation accepts ZIP files and enforces boundary conditions', () => {
  assert.equal(
    uploadFiles.validateAssetsFile(file('ASSETS.ZIP', uploadFiles.MAX_ASSETS_BYTES)),
    null,
  )
  assert.equal(uploadFiles.validateAssetsFile(file('empty.zip', 0)), '资源压缩包不能为空。')
  assert.equal(
    uploadFiles.validateAssetsFile(file('large.zip', uploadFiles.MAX_ASSETS_BYTES + 1)),
    '资源压缩包不能超过 50 MiB。',
  )
  assert.equal(
    uploadFiles.validateAssetsFile(file('assets.tar', 1024)),
    '请选择扩展名为 .zip 的资源压缩包。',
  )
})

test('File sizes are formatted consistently at unit boundaries', () => {
  assert.equal(uploadFiles.formatFileSize(0), '0 B')
  assert.equal(uploadFiles.formatFileSize(1023), '1023 B')
  assert.equal(uploadFiles.formatFileSize(1024), '1.0 KiB')
  assert.equal(uploadFiles.formatFileSize(1024 * 1024), '1.0 MiB')
})

test('PDF job labels cover every supported status', () => {
  assert.deepEqual(pdfJobStatus.PDF_JOB_STATUS_LABELS, {
    created: '准备上传',
    uploaded: '上传完成',
    queued: '等待构建',
    building: '正在构建',
    uploading: '正在上传 PDF',
    completed: '已完成',
    failed: '构建失败',
    expired: '已过期',
  })
})

test('Only completed, failed and expired jobs are terminal', () => {
  for (const status of ['completed', 'failed', 'expired']) {
    assert.equal(pdfJobStatus.isTerminalPdfJobStatus(status), true)
  }

  for (const status of ['created', 'uploaded', 'queued', 'building', 'uploading']) {
    assert.equal(pdfJobStatus.isTerminalPdfJobStatus(status), false)
  }
})

test('Terminal refresh keys are stable for duplicate final updates', () => {
  assert.equal(
    pdfJobStatus.getTerminalPdfJobRefreshKey({ id: 'job-1', status: 'building' }),
    null,
  )
  assert.equal(
    pdfJobStatus.getTerminalPdfJobRefreshKey({ id: 'job-1', status: 'completed' }),
    'job-1:completed',
  )
  assert.equal(
    pdfJobStatus.getTerminalPdfJobRefreshKey({ id: 'job-1', status: 'completed' }),
    'job-1:completed',
  )
  assert.equal(
    pdfJobStatus.getTerminalPdfJobRefreshKey({ id: 'job-1', status: 'failed' }),
    'job-1:failed',
  )
})

test('Realtime health selects low-frequency reconciliation or fast fallback polling', () => {
  assert.equal(
    realtimePolling.getPdfJobPollInterval('SUBSCRIBED'),
    realtimePolling.HEALTHY_REALTIME_POLL_INTERVAL_MS,
  )
  assert.equal(realtimePolling.HEALTHY_REALTIME_POLL_INTERVAL_MS, 60_000)

  for (const status of ['CONNECTING', 'TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR']) {
    assert.equal(
      realtimePolling.getPdfJobPollInterval(status),
      realtimePolling.FALLBACK_POLL_INTERVAL_MS,
    )
  }
  assert.equal(realtimePolling.FALLBACK_POLL_INTERVAL_MS, 10_000)
})

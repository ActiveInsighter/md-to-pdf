import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import {
  getPdfJobListRevision,
  markPdfJobListSnapshot,
  mergeJobIntoCache,
  reconcilePdfJobHistory,
  removeJobFromCache,
  shouldApplyPdfJobUpdate,
} from '../src/features/pdf-jobs/hooks/cache'
import { pdfJobKeys } from '../src/features/pdf-jobs/queryKeys'
import type { PdfJob } from '../src/features/pdf-jobs/types'

function job(userId: string, patch: Partial<PdfJob> = {}): PdfJob {
  return {
    id: `job-${userId}`,
    user_id: userId,
    status: 'queued',
    input_path: null,
    assets_path: null,
    output_path: null,
    source_filename: 'notes.md',
    document_name: `${userId} notes`,
    has_assets: false,
    theme: 'chatgpt-light',
    options: {},
    github_run_id: null,
    github_run_url: null,
    error_message: null,
    is_favorite: false,
    created_at: '2026-07-13T00:00:00.000Z',
    updated_at: '2026-07-13T00:01:00.000Z',
    started_at: null,
    completed_at: null,
    expires_at: '2026-08-13T00:00:00.000Z',
    ...patch,
  }
}

test('query keys isolate users while all filters share one list cache', () => {
  assert.deepEqual(pdfJobKeys.list('user-a'), ['pdf-jobs', 'list', 'user-a'])
  assert.deepEqual(pdfJobKeys.list('user-b'), ['pdf-jobs', 'list', 'user-b'])
  assert.deepEqual(pdfJobKeys.detail('user-a', 'job-1'), ['pdf-jobs', 'detail', 'user-a', 'job-1'])
  assert.notDeepEqual(pdfJobKeys.list('user-a'), pdfJobKeys.list('user-b'))
})

test('realtime cache merging only updates the owning user cache', () => {
  const queryClient = new QueryClient()
  const userA = job('user-a')
  const userB = job('user-b')
  queryClient.setQueryData(pdfJobKeys.list('user-a'), [userA])
  queryClient.setQueryData(pdfJobKeys.list('user-b'), [userB])

  mergeJobIntoCache(queryClient, {
    ...userA,
    status: 'building',
    updated_at: '2026-07-13T00:02:00.000Z',
  })

  assert.equal(queryClient.getQueryData<PdfJob[]>(pdfJobKeys.list('user-a'))?.[0].status, 'building')
  assert.deepEqual(queryClient.getQueryData(pdfJobKeys.list('user-b')), [userB])
  assert.equal(queryClient.getQueryData<PdfJob>(pdfJobKeys.detail('user-a', userA.id))?.status, 'building')
  assert.equal(queryClient.getQueryData(pdfJobKeys.detail('user-b', userA.id)), undefined)
})

test('terminal jobs cannot roll back but can advance to expired', () => {
  const completed = job('user-a', {
    status: 'completed',
    updated_at: '2026-07-13T00:02:00.000Z',
  })

  assert.equal(shouldApplyPdfJobUpdate(completed, {
    ...completed,
    status: 'uploading',
    updated_at: '2026-07-13T00:03:00.000Z',
  }), false)

  assert.equal(shouldApplyPdfJobUpdate(completed, {
    ...completed,
    status: 'expired',
    updated_at: '2026-08-13T00:00:00.000Z',
  }), true)

  assert.equal(shouldApplyPdfJobUpdate(completed, {
    ...completed,
    status: 'expired',
    updated_at: '2026-07-13T00:01:00.000Z',
  }), false)
})

test('session cleanup removes pdf job caches and selection but keeps preferences', async () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
  const { clearAuthenticatedWorkspaceState } = await import('../src/features/auth/hooks/authenticatedWorkspaceState')
  const { useWorkspaceStore } = await import('../src/stores/workspaceStore')
  const queryClient = new QueryClient()
  const userA = job('user-a')
  queryClient.setQueryData(pdfJobKeys.list('user-a'), [userA])
  queryClient.setQueryData(pdfJobKeys.detail('user-a', userA.id), userA)
  queryClient.setQueryData(['unrelated'], 'preserved')

  useWorkspaceStore.getState().setSelectedJobId(userA.id)
  useWorkspaceStore.getState().setTheme('academic')
  useWorkspaceStore.getState().setAutoDownload(true)
  useWorkspaceStore.getState().setFilters({ status: 'failed', search: 'private-document-name' })

  await clearAuthenticatedWorkspaceState(queryClient)

  assert.equal(queryClient.getQueryData(pdfJobKeys.list('user-a')), undefined)
  assert.equal(queryClient.getQueryData(pdfJobKeys.detail('user-a', userA.id)), undefined)
  assert.equal(queryClient.getQueryData(['unrelated']), 'preserved')
  assert.equal(useWorkspaceStore.getState().selectedJobId, null)
  assert.equal(useWorkspaceStore.getState().theme, 'academic')
  assert.equal(useWorkspaceStore.getState().autoDownload, true)
  assert.deepEqual(useWorkspaceStore.getState().filters, { status: 'failed', search: '' })
})

test('an authoritative list response removes rows missing before the request began', () => {
  const userId = 'authoritative-user'
  const retained = job(userId, { id: 'retained-job' })
  const removed = job(userId, { id: 'removed-job' })
  const revision = getPdfJobListRevision(userId)
  const response = markPdfJobListSnapshot([retained], userId, revision)

  assert.deepEqual(
    reconcilePdfJobHistory([retained, removed], response).map((item) => item.id),
    ['retained-job'],
  )
})

test('a realtime insert during a list request survives its older response', () => {
  const userId = 'insert-race-user'
  const existing = job(userId, { id: 'existing-job' })
  const inserted = job(userId, {
    id: 'inserted-job',
    created_at: '2026-07-13T00:02:00.000Z',
    updated_at: '2026-07-13T00:02:00.000Z',
  })
  const queryClient = new QueryClient()
  queryClient.setQueryData(pdfJobKeys.list(userId), [existing])
  const revision = getPdfJobListRevision(userId)

  mergeJobIntoCache(queryClient, inserted)
  const response = markPdfJobListSnapshot([existing], userId, revision)
  const current = queryClient.getQueryData<PdfJob[]>(pdfJobKeys.list(userId))

  assert.deepEqual(
    reconcilePdfJobHistory(current, response).map((item) => item.id),
    ['inserted-job', 'existing-job'],
  )
})

test('a realtime delete removes both caches and cannot be revived by an older response', () => {
  const userId = 'delete-race-user'
  const deleted = job(userId, { id: 'deleted-job' })
  const queryClient = new QueryClient()
  queryClient.setQueryData(pdfJobKeys.list(userId), [deleted])
  queryClient.setQueryData(pdfJobKeys.detail(userId, deleted.id), deleted)
  const revision = getPdfJobListRevision(userId)

  removeJobFromCache(queryClient, userId, deleted.id)
  assert.deepEqual(queryClient.getQueryData(pdfJobKeys.list(userId)), [])
  assert.equal(queryClient.getQueryData(pdfJobKeys.detail(userId, deleted.id)), undefined)

  const staleResponse = markPdfJobListSnapshot([deleted], userId, revision)
  assert.deepEqual(reconcilePdfJobHistory([], staleResponse), [])
})

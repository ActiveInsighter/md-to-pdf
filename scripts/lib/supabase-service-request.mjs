const STATUS_RE = /^[a-z][a-z0-9-]{0,47}$/

export const WORKFLOW_EXPECTED_STATUSES = Object.freeze({
  building: Object.freeze(['queued']),
  progress: Object.freeze(['building']),
  uploading: Object.freeze(['building']),
  completed: Object.freeze(['uploading']),
  failed: Object.freeze(['queued', 'building', 'uploading']),
})

export const WORKFLOW_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'failed',
  'cancelled',
  'expired',
])

export function isLegacyServiceRoleKey(value) {
  const key = String(value || '').trim()
  if (!key) throw new Error('Supabase service key is required')
  return !key.startsWith('sb_secret_')
}

export function serviceKeyHeaders(value, extra = {}) {
  const key = String(value || '').trim()
  const legacyBearer = isLegacyServiceRoleKey(key)
  return {
    apikey: key,
    ...(legacyBearer ? { Authorization: `Bearer ${key}` } : {}),
    ...extra,
  }
}

export function postgrestStatusFilter(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error('At least one expected status is required')
  }

  const normalized = [...new Set(statuses.map((status) => String(status || '').trim()))]
  if (normalized.some((status) => !STATUS_RE.test(status))) {
    throw new Error('Expected statuses contain an invalid value')
  }
  return `in.(${normalized.join(',')})`
}

export function isIdempotentStatus(status, allowedStatuses) {
  return allowedStatuses.includes(String(status || ''))
}

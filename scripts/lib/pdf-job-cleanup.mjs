export const SAFE_EXPIRABLE_STATUSES = Object.freeze([
  'created',
  'uploaded',
  'completed',
  'failed',
  'cancelled',
])

export function cleanupObjectPaths(job) {
  const id = String(job?.id || '')
  const allowed = new Set([
    `jobs/${id}/input.md`,
    `jobs/${id}/assets.zip`,
    `jobs/${id}/output.pdf`,
  ])
  const paths = [job?.input_path, job?.assets_path, job?.output_path]
    .filter((value) => typeof value === 'string' && value.length > 0)

  if (paths.some((value) => !allowed.has(value))) {
    throw new Error('PDF job contains an unexpected Storage path')
  }
  return [...new Set(paths)]
}

export function configureCandidateQuery(url, { cutoff, lastId = '', retryExpired = false }) {
  url.searchParams.set('select', 'id,status,input_path,assets_path,output_path')
  url.searchParams.set('order', 'id.asc')
  url.searchParams.set('limit', '200')
  if (lastId) url.searchParams.set('id', `gt.${lastId}`)

  if (retryExpired) {
    url.searchParams.set('status', 'eq.expired')
    url.searchParams.set(
      'or',
      '(input_path.not.is.null,assets_path.not.is.null,output_path.not.is.null)',
    )
  } else {
    url.searchParams.set('expires_at', `lt.${cutoff}`)
    url.searchParams.set('is_favorite', 'eq.false')
    url.searchParams.set('status', `in.(${SAFE_EXPIRABLE_STATUSES.join(',')})`)
  }
  return url
}

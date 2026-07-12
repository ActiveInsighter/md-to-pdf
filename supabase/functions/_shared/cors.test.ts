import assert from 'node:assert/strict'
import test from 'node:test'

import { handleOptions, isAllowedOrigin, json } from './cors.ts'

const productionOrigin = 'https://md-to-pdf-web.pages.dev'
const previewOrigin = 'https://feature-login.md-to-pdf-web.pages.dev'
const customOrigin = 'https://to-any.top'
const customSubdomainOrigin = 'https://pdf.to-any.top'
const alternateCustomOrigin = 'https://mdpdf.any1.tech'
const localOrigin = 'http://localhost:5173'
const disallowedOrigin = 'https://unrelated.example'

const allowedOrigins = [
  productionOrigin,
  previewOrigin,
  customOrigin,
  customSubdomainOrigin,
  alternateCustomOrigin,
  localOrigin,
]

test('allows production, preview, custom-domain and local development origins', () => {
  for (const origin of allowedOrigins) assert.equal(isAllowedOrigin(origin), true, origin)
})

test('rejects unrelated and insecure origins', () => {
  assert.equal(isAllowedOrigin(disallowedOrigin), false)
  assert.equal(isAllowedOrigin('https://to-any.top.invalid.example'), false)
  assert.equal(isAllowedOrigin('https://example.com'), false)
  assert.equal(isAllowedOrigin('http://md-to-pdf-web.pages.dev'), false)
  assert.equal(isAllowedOrigin('http://to-any.top'), false)
})

test('returns a cacheable preflight response for every supported origin', () => {
  for (const origin of allowedOrigins) {
    const request = new Request('https://project.supabase.co/functions/v1/create-pdf-job', {
      method: 'OPTIONS',
      headers: { Origin: origin },
    })

    const response = handleOptions(request)
    assert.ok(response)
    assert.equal(response.status, 204, origin)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(response.headers.get('access-control-max-age'), '86400')
    assert.equal(response.headers.get('vary'), 'Origin')
  }
})

test('rejects preflight requests from a disallowed origin', async () => {
  const request = new Request('https://project.supabase.co/functions/v1/create-pdf-job', {
    method: 'OPTIONS',
    headers: { Origin: disallowedOrigin },
  })

  const response = handleOptions(request)
  assert.ok(response)
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.deepEqual(await response.json(), { error: '不允许的请求来源。' })
})

test('echoes only an allowed request origin on JSON responses', async () => {
  const allowedRequest = new Request('https://project.supabase.co/functions/v1/create-pdf-job', {
    method: 'POST',
    headers: { Origin: customSubdomainOrigin },
  })
  const allowedResponse = json(allowedRequest, { ok: true }, 201)

  assert.equal(allowedResponse.status, 201)
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), customSubdomainOrigin)
  assert.deepEqual(await allowedResponse.json(), { ok: true })

  const disallowedRequest = new Request('https://project.supabase.co/functions/v1/create-pdf-job', {
    method: 'POST',
    headers: { Origin: disallowedOrigin },
  })
  const disallowedResponse = json(disallowedRequest, { ok: false })

  assert.equal(disallowedResponse.headers.get('access-control-allow-origin'), null)
  assert.equal(disallowedResponse.headers.get('vary'), 'Origin')
})

test('supports server-to-server requests without an Origin header', () => {
  const request = new Request('https://project.supabase.co/functions/v1/create-pdf-job', {
    method: 'POST',
  })
  const response = json(request, { ok: true })

  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
})

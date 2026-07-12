const EXACT_ALLOWED_ORIGINS = new Set([
  'https://md-to-pdf-web.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const CLOUDFLARE_PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.md-to-pdf-web\.pages\.dev$/i

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

export function isAllowedOrigin(origin: string): boolean {
  return EXACT_ALLOWED_ORIGINS.has(origin) || CLOUDFLARE_PREVIEW_ORIGIN_RE.test(origin)
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin')?.trim() || ''
  return {
    ...BASE_CORS_HEADERS,
    ...(origin && isAllowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null

  const origin = req.headers.get('origin')?.trim() || ''
  if (origin && !isAllowedOrigin(origin)) {
    return json(req, { error: '不允许的请求来源。' }, 403)
  }

  return new Response(null, { status: 204, headers: corsHeaders(req) })
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

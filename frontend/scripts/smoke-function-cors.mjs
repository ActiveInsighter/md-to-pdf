function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function commaSeparatedValues(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '')
const functionNames = ['create-pdf-job', 'get-pdf-download']
const allowedOrigins = [
  'https://md-to-pdf-web.pages.dev',
  'https://to-any.top',
  'https://pdf.to-any.top',
  'https://mdpdf.any1.tech',
]
const requestedHeaders = ['authorization', 'apikey', 'content-type', 'x-client-info']

async function checkAllowedPreflight(functionName, origin) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': requestedHeaders.join(', '),
    },
  })

  assert(response.status === 204, `${functionName} rejected ${origin} with HTTP ${response.status}`)
  assert(
    response.headers.get('access-control-allow-origin') === origin,
    `${functionName} did not echo the allowed origin ${origin}`,
  )

  const allowedMethods = commaSeparatedValues(response.headers.get('access-control-allow-methods'))
  assert(allowedMethods.includes('post'), `${functionName} preflight does not allow POST`)
  assert(allowedMethods.includes('options'), `${functionName} preflight does not allow OPTIONS`)

  const allowedHeaders = commaSeparatedValues(response.headers.get('access-control-allow-headers'))
  for (const header of requestedHeaders) {
    assert(allowedHeaders.includes(header), `${functionName} preflight does not allow ${header}`)
  }
}

async function checkRejectedPreflight(functionName) {
  const origin = 'https://unrelated.example'
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': requestedHeaders.join(', '),
    },
  })

  assert(response.status === 403, `${functionName} unexpectedly accepted an unrelated origin`)
  assert(
    response.headers.get('access-control-allow-origin') === null,
    `${functionName} exposed an allow-origin header for an unrelated origin`,
  )
}

for (const functionName of functionNames) {
  for (const origin of allowedOrigins) {
    await checkAllowedPreflight(functionName, origin)
    console.log(`CORS preflight passed: ${functionName} <- ${origin}`)
  }
  await checkRejectedPreflight(functionName)
}

console.log('Browser CORS smoke test passed')

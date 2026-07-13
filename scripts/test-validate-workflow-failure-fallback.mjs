import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowUrl = new URL('../.github/workflows/build-pdf-api.yml', import.meta.url)

async function failureStepSource() {
  const source = await readFile(workflowUrl, 'utf8')
  const step = source.match(
    /- name: Mark failed[\s\S]*?(?=\n\s{6}- name:|\s*$)/,
  )?.[0]
  assert.ok(step, 'Mark failed step must exist')
  return step
}

test('failure reporting survives a missing checkout while preferring the repository helper', async () => {
  const step = await failureStepSource()

  assert.match(step, /if: failure\(\)/)
  assert.match(step, /continue-on-error: true/)
  assert.match(step, /\[\[ -f scripts\/supabase-pdf-job\.mjs \]\]/)
  assert.match(step, /node scripts\/supabase-pdf-job\.mjs fail/)
  assert.match(step, /node --input-type=module <<'NODE'/)
})

test('inline failure reporter is syntactically valid and uses a status CAS', async () => {
  const step = await failureStepSource()
  const inlineSource = step.match(
    /node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s*NODE/,
  )?.[1]

  assert.ok(inlineSource, 'inline Node fallback must be present')
  assert.doesNotThrow(() => new Function(`return async () => {\n${inlineSource}\n}`))
  assert.match(inlineSource, /url\.searchParams\.set\('id', `eq\.\$\{jobId\}`\)/)
  assert.match(inlineSource, /url\.searchParams\.set\('status', 'in\.\(queued,building,uploading\)'\)/)
  assert.match(inlineSource, /status: 'failed'/)
  assert.match(inlineSource, /Prefer: 'return=representation'/)
})

test('inline failure reporter keeps modern secret keys out of the bearer header', async () => {
  const step = await failureStepSource()

  assert.match(step, /serviceKey\.startsWith\('sb_secret_'\)/)
  assert.match(step, /isSecretKey \? \{\} : \{ Authorization: `Bearer \$\{serviceKey\}` \}/)
  assert.doesNotMatch(step, /console\.(?:log|error)\([^\n]*(?:serviceKey|response\.text)/)
})

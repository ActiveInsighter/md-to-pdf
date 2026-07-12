import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer'

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const pagesUrl = new URL(requiredEnv('PAGES_URL'))
const targetUrl = new URL(pagesUrl)
targetUrl.searchParams.set('deployment', requiredEnv('GITHUB_SHA'))
const credentialsPath = path.resolve(requiredEnv('UI_CAPTURE_CREDENTIALS_PATH'))
const outputDirectory = path.resolve(requiredEnv('UI_CAPTURE_OUTPUT_DIR'))
const chromeExecutable = process.env.CHROME_EXECUTABLE_PATH?.trim() || '/usr/bin/google-chrome'
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))

if (!credentials.email || !credentials.password) {
  throw new Error('Temporary UI capture credentials are incomplete.')
}

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--lang=zh-CN',
  ],
})

const captured = []
const diagnostics = []

async function settle(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function setInputValue(page, selector, value) {
  await page.$eval(selector, (input, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!setter) throw new Error('Unable to resolve native input value setter.')
    setter.call(input, nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

async function clearSensitiveInputs(page) {
  await page.evaluate(() => {
    for (const input of document.querySelectorAll('#auth-panel input')) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }).catch(() => undefined)
}

async function waitForLoginResult(page, authResponses) {
  const deadline = Date.now() + 35_000
  while (Date.now() < deadline) {
    const result = await page.evaluate(() => {
      const workspace = document.querySelector('.workspace-hero')
      if (workspace) return { kind: 'workspace' }

      const message = document.querySelector('#auth-panel .auth-message, #auth-panel .error-text')
      const text = message?.textContent?.trim() || ''
      if (text) return { kind: 'error', text }

      return { kind: 'waiting' }
    })

    if (result.kind === 'workspace') return
    if (result.kind === 'error') {
      throw new Error(`Login form reported: ${result.text}`)
    }
    await settle(400)
  }

  const statuses = authResponses.length > 0 ? authResponses.join(', ') : 'none observed'
  throw new Error(`Authenticated workspace did not appear. Auth response statuses: ${statuses}.`)
}

async function captureViewport({ name, width, height, mobile }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const authResponses = []
  const browserErrors = []

  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(30_000)
  page.on('pageerror', (error) => browserErrors.push(error.message.slice(0, 500)))
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/auth/v1/')) {
      browserErrors.push(`Auth request failed: ${request.failure()?.errorText || 'unknown failure'}`)
    }
  })
  page.on('response', (response) => {
    if (response.url().includes('/auth/v1/token')) authResponses.push(response.status())
  })

  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7' })

  try {
    await page.goto(targetUrl.href, { waitUntil: 'networkidle2' })
    await page.waitForSelector('#auth-panel', { visible: true })
    await settle(1_200)

    const publicFile = `public-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, publicFile),
      fullPage: true,
    })
    captured.push({ file: publicFile, viewport: `${width}x${height}`, fullPage: true, authenticated: false })

    await setInputValue(page, '#auth-panel input[type="email"]', credentials.email)
    await setInputValue(page, '#auth-panel input[type="password"]', credentials.password)
    await page.waitForFunction(() => {
      const button = document.querySelector('#auth-panel button[type="submit"]')
      return button instanceof HTMLButtonElement && !button.disabled
    })
    await page.click('#auth-panel button[type="submit"]')
    await waitForLoginResult(page, authResponses)
    await settle(2_500)

    const authenticatedFile = `authenticated-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, authenticatedFile),
      fullPage: true,
    })
    captured.push({ file: authenticatedFile, viewport: `${width}x${height}`, fullPage: true, authenticated: true })
    diagnostics.push({ viewport: name, login: 'success', authResponseStatuses: authResponses, browserErrors })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await clearSensitiveInputs(page)
    const diagnosticFile = `diagnostic-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, diagnosticFile),
      fullPage: true,
    }).catch(() => undefined)
    diagnostics.push({
      viewport: name,
      login: 'failed',
      error: message.slice(0, 1000),
      authResponseStatuses: authResponses,
      browserErrors,
      screenshot: diagnosticFile,
    })
    throw error
  } finally {
    await context.close()
  }
}

let captureError = null
try {
  await captureViewport({ name: 'desktop-1440', width: 1440, height: 1000, mobile: false })
  await captureViewport({ name: 'mobile-390', width: 390, height: 844, mobile: true })
} catch (error) {
  captureError = error
} finally {
  await browser.close()
}

const metadata = {
  url: pagesUrl.origin,
  commit: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  capturedAt: new Date().toISOString(),
  browser: 'system Google Chrome via locked Puppeteer dependency',
  temporaryAuthenticatedUser: true,
  screenshots: captured,
  diagnostics,
}
await writeFile(path.join(outputDirectory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)

if (captureError) throw captureError

const expected = [
  'public-desktop-1440.png',
  'authenticated-desktop-1440.png',
  'public-mobile-390.png',
  'authenticated-mobile-390.png',
]
if (!expected.every((file) => captured.some((item) => item.file === file))) {
  throw new Error('Not all expected public and authenticated screenshots were captured.')
}

console.log('Captured public and authenticated production UI screenshots.')

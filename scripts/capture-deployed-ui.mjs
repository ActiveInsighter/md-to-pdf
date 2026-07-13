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
const AUTH_PANEL_SELECTOR = '#auth-panel'
const AUTHENTICATED_WORKSPACE_SELECTOR = '[data-ui-capture="authenticated-workspace"]'
const OVERVIEW_FILE = 'ui-overview.png'
const PUBLIC_PAGE_ATTEMPTS = 6

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
  await page.evaluate((authPanelSelector) => {
    for (const input of document.querySelectorAll(`${authPanelSelector} input`)) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, AUTH_PANEL_SELECTOR).catch(() => undefined)
}

async function inspectPublicPage(page) {
  return page.evaluate(({ authPanelSelector, workspaceSelector }) => {
    if (document.querySelector(authPanelSelector)) return { kind: 'ready', detail: '' }
    if (document.querySelector(workspaceSelector)) return { kind: 'workspace', detail: '' }

    const text = document.body?.innerText?.replace(/\s+/g, ' ').trim() || ''
    if (/Failed to fetch dynamically imported module|这个页面暂时打不开/i.test(text)) {
      return { kind: 'asset-propagation', detail: text.slice(0, 500) }
    }
    return { kind: 'waiting', detail: text.slice(0, 300) }
  }, {
    authPanelSelector: AUTH_PANEL_SELECTOR,
    workspaceSelector: AUTHENTICATED_WORKSPACE_SELECTOR,
  })
}

async function openPublicPage(page) {
  const attempts = []

  for (let attempt = 1; attempt <= PUBLIC_PAGE_ATTEMPTS; attempt += 1) {
    const attemptUrl = new URL(targetUrl)
    attemptUrl.searchParams.set('captureAttempt', `${attempt}-${Date.now()}`)

    try {
      await page.goto(attemptUrl.href, { waitUntil: 'networkidle2' })
    } catch (error) {
      attempts.push(`attempt ${attempt}: navigation failed: ${error instanceof Error ? error.message : String(error)}`)
      await settle(attempt * 2_000)
      continue
    }

    const deadline = Date.now() + 12_000
    let lastResult = { kind: 'waiting', detail: '' }
    while (Date.now() < deadline) {
      lastResult = await inspectPublicPage(page)
      if (lastResult.kind === 'ready') return attempt
      if (lastResult.kind === 'asset-propagation') break
      if (lastResult.kind === 'workspace') {
        await page.evaluate(() => {
          window.localStorage.clear()
          window.sessionStorage.clear()
        }).catch(() => undefined)
        break
      }
      await settle(400)
    }

    attempts.push(`attempt ${attempt}: ${lastResult.kind}${lastResult.detail ? `: ${lastResult.detail}` : ''}`)
    await settle(attempt * 2_500)
  }

  throw new Error(`Public login page did not stabilize after ${PUBLIC_PAGE_ATTEMPTS} attempts. ${attempts.join(' | ')}`)
}

async function waitForLoginResult(page, authResponses) {
  const deadline = Date.now() + 35_000
  while (Date.now() < deadline) {
    const result = await page.evaluate(({ authPanelSelector, workspaceSelector }) => {
      const workspace = document.querySelector(workspaceSelector)
      if (workspace) return { kind: 'workspace' }

      const message = document.querySelector(`${authPanelSelector} .auth-message, ${authPanelSelector} .error-text`)
      const text = message?.textContent?.trim() || ''
      if (text) return { kind: 'error', text }

      const bodyText = document.body?.innerText || ''
      if (/Failed to fetch dynamically imported module|这个页面暂时打不开/i.test(bodyText)) {
        return { kind: 'error', text: 'Pages assets changed while the authenticated route was loading.' }
      }

      return { kind: 'waiting' }
    }, {
      authPanelSelector: AUTH_PANEL_SELECTOR,
      workspaceSelector: AUTHENTICATED_WORKSPACE_SELECTOR,
    })

    if (result.kind === 'workspace') return
    if (result.kind === 'error') {
      throw new Error(`Login form reported: ${result.text}`)
    }
    await settle(400)
  }

  const statuses = authResponses.length > 0 ? authResponses.join(', ') : 'none observed'
  throw new Error(`Authenticated workspace marker did not appear. Auth response statuses: ${statuses}.`)
}

async function captureViewport({ name, width, height, mobile }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const authResponses = []
  const browserErrors = []

  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(30_000)
  await page.setCacheEnabled(false)
  page.on('pageerror', (error) => browserErrors.push(error.message.slice(0, 500)))
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/auth/v1/') || url.includes('/assets/')) {
      browserErrors.push(`${url.includes('/assets/') ? 'Asset' : 'Auth'} request failed: ${request.failure()?.errorText || 'unknown failure'} (${url.slice(0, 240)})`)
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
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  })

  try {
    const publicAttempt = await openPublicPage(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await settle(1_200)

    const publicFile = `public-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, publicFile),
      fullPage: true,
    })
    captured.push({ file: publicFile, viewport: `${width}x${height}`, fullPage: true, authenticated: false })

    await setInputValue(page, `${AUTH_PANEL_SELECTOR} input[type="email"]`, credentials.email)
    await setInputValue(page, `${AUTH_PANEL_SELECTOR} input[type="password"]`, credentials.password)
    await page.waitForFunction((authPanelSelector) => {
      const button = document.querySelector(`${authPanelSelector} button[type="submit"]`)
      return button instanceof HTMLButtonElement && !button.disabled
    }, {}, AUTH_PANEL_SELECTOR)
    await page.click(`${AUTH_PANEL_SELECTOR} button[type="submit"]`)
    await waitForLoginResult(page, authResponses)
    await page.evaluate(() => window.scrollTo(0, 0))
    await settle(2_500)

    const authenticatedFile = `authenticated-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, authenticatedFile),
      fullPage: true,
    })
    captured.push({ file: authenticatedFile, viewport: `${width}x${height}`, fullPage: true, authenticated: true })
    diagnostics.push({ viewport: name, login: 'success', publicAttempt, authResponseStatuses: authResponses, browserErrors })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await clearSensitiveInputs(page)
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined)
    const diagnosticFile = `diagnostic-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, diagnosticFile),
      fullPage: true,
    }).catch(() => undefined)
    diagnostics.push({
      viewport: name,
      login: 'failed',
      error: message.slice(0, 2000),
      authResponseStatuses: authResponses,
      browserErrors,
      screenshot: diagnosticFile,
    })
    throw error
  } finally {
    await context.close()
  }
}

async function composeOverview() {
  const sources = [
    { file: 'public-desktop-1440.png', label: '公开页面 · Desktop 1440', kind: 'desktop' },
    { file: 'authenticated-desktop-1440.png', label: '登录页面 · Desktop 1440', kind: 'desktop' },
    { file: 'public-mobile-390.png', label: '公开页面 · Mobile 390', kind: 'mobile' },
    { file: 'authenticated-mobile-390.png', label: '登录页面 · Mobile 390', kind: 'mobile' },
  ]

  const images = await Promise.all(sources.map(async (source) => ({
    ...source,
    dataUrl: `data:image/png;base64,${(await readFile(path.join(outputDirectory, source.file))).toString('base64')}`,
  })))

  const figure = (image) => `
    <figure class="capture ${image.kind}">
      <figcaption>${image.label}</figcaption>
      <img src="${image.dataUrl}" alt="${image.label}" />
    </figure>`
  const desktopFigures = images.filter((image) => image.kind === 'desktop').map(figure).join('')
  const mobileFigures = images.filter((image) => image.kind === 'mobile').map(figure).join('')
  const html = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #eef1f4; color: #172033; font-family: Arial, "Noto Sans CJK SC", sans-serif; }
        body { padding: 32px; }
        header { margin-bottom: 24px; padding: 24px 28px; border: 1px solid #d7dee7; border-radius: 18px; background: white; }
        h1 { margin: 0; font-size: 28px; }
        p { margin: 8px 0 0; color: #667085; font-size: 14px; }
        section { display: grid; gap: 24px; margin-top: 24px; }
        .desktop-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
        .mobile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
        .capture { min-width: 0; margin: 0; overflow: hidden; border: 1px solid #cfd7e3; border-radius: 18px; background: white; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
        figcaption { padding: 14px 18px; border-bottom: 1px solid #dfe5ec; font-size: 14px; font-weight: 700; }
        img { display: block; width: 100%; height: auto; background: white; }
        .mobile img { width: 390px; max-width: 100%; margin: 0 auto; }
      </style>
    </head>
    <body>
      <header>
        <h1>Cloudflare Pages UI 总览</h1>
        <p>${pagesUrl.origin} · commit ${process.env.GITHUB_SHA || 'unknown'} · 一张图快速检查桌面端与移动端</p>
      </header>
      <section class="desktop-grid">${desktopFigures}</section>
      <section class="mobile-grid">${mobileFigures}</section>
    </body>
  </html>`

  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0))
    await settle(500)
    await page.screenshot({ path: path.join(outputDirectory, OVERVIEW_FILE), fullPage: true })
    captured.push({ file: OVERVIEW_FILE, composite: true, sources: sources.map((source) => source.file) })
  } finally {
    await page.close()
  }
}

let captureError = null
try {
  await captureViewport({ name: 'desktop-1440', width: 1440, height: 1000, mobile: false })
  await captureViewport({ name: 'mobile-390', width: 390, height: 844, mobile: true })
  await composeOverview()
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
  overview: OVERVIEW_FILE,
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
  OVERVIEW_FILE,
]
if (!expected.every((file) => captured.some((item) => item.file === file))) {
  throw new Error('Not all expected screenshots and the combined overview were captured.')
}

console.log('Captured production UI screenshots and composed ui-overview.png.')

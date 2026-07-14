import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer'

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const pagesUrl = new URL(requiredEnv('PAGES_URL'))
const outputDirectory = path.resolve(requiredEnv('UI_CAPTURE_OUTPUT_DIR'))
const sessionPath = path.resolve(requiredEnv('UI_CAPTURE_SESSION_PATH'))
const chromeExecutable = process.env.CHROME_EXECUTABLE_PATH?.trim() || '/usr/bin/google-chrome'
const sessionPayload = JSON.parse(await readFile(sessionPath, 'utf8'))
const commit = requiredEnv('GITHUB_SHA')
const OVERVIEW_FILE = 'ui-overview.png'
const VIEWPORT = { width: 1440, height: 1000, deviceScaleFactor: 1 }
const SELECTORS = {
  workspace: '[data-ui-capture="authenticated-workspace"]',
  fileInput: '[data-ui-capture="markdown-file-input"]',
  uploadStatus: '[data-ui-capture="source-upload-status"]',
  jobs: '[data-ui-capture="jobs-list"]',
  favorites: '[data-ui-capture="favorites-list"]',
  detail: '[data-ui-capture="job-detail"]',
  settings: '[data-ui-capture="settings-page"]',
}

if (!sessionPayload.storageKey || !sessionPayload.session?.access_token) {
  throw new Error('Temporary browser session is incomplete.')
}

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chromeExecutable,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
})

const captured = []
const diagnostics = []

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function routeUrl(route) {
  const url = new URL(route, pagesUrl.origin)
  url.searchParams.set('deployment', commit)
  url.searchParams.set('captureAttempt', String(Date.now()))
  return url.href
}

async function navigate(page, route, selector) {
  const failures = []
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await page.goto(routeUrl(route), { waitUntil: 'networkidle2' })
      await page.waitForSelector(selector, { visible: true, timeout: 20_000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await sleep(900)
      return
    } catch (error) {
      failures.push(`attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`)
      await sleep(attempt * 1_500)
    }
  }
  throw new Error(`Unable to open ${route}. ${failures.join(' | ')}`)
}

async function capture(page, file, label, route, selector) {
  await navigate(page, route, selector)
  await page.screenshot({ path: path.join(outputDirectory, file), fullPage: true })
  captured.push({ file, label, route, viewport: '1440x1000', fullPage: true })
}

async function installSession(page) {
  await page.goto(routeUrl('/'), { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ storageKey, session }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session))
  }, sessionPayload)
  await navigate(page, '/workspace', SELECTORS.workspace)
}

async function captureBatchMode(page) {
  await navigate(page, '/workspace', SELECTORS.workspace)
  const batchButton = await page.waitForSelector('button[role="tab"]', { visible: true, timeout: 20_000 })
  if (!batchButton) throw new Error('Workspace tabs were not found.')
  const buttons = await page.$$('button[role="tab"]')
  let clicked = false
  for (const button of buttons) {
    const text = await button.evaluate((element) => element.textContent?.trim() || '')
    if (text === '批量') {
      await button.click()
      clicked = true
      break
    }
  }
  if (!clicked) throw new Error('Batch workspace tab was not found.')
  await page.waitForFunction(() => document.body.innerText.includes('批量构建'), { timeout: 20_000 })
  await sleep(600)
  await page.screenshot({ path: path.join(outputDirectory, 'workspace-batch-desktop.png'), fullPage: true })
  captured.push({ file: 'workspace-batch-desktop.png', label: '创建任务 · 批量', route: '/workspace#batch', viewport: '1440x1000', fullPage: true })
}

async function createSampleTask(page) {
  const samplePath = path.join(outputDirectory, '.deployment-ui-sample.md')
  await writeFile(samplePath, [
    '# 部署界面检查',
    '',
    '临时任务用于检查创建页、任务列表和任务详情布局。',
    '',
    '## 检查项',
    '',
    '- 页面结构',
    '- 状态反馈',
    '- 构建流程',
    '',
  ].join('\n'), 'utf8')

  try {
    await navigate(page, '/workspace', SELECTORS.workspace)
    const input = await page.waitForSelector(SELECTORS.fileInput, { timeout: 20_000 })
    if (!input) throw new Error('Markdown file input was not found.')
    await input.uploadFile(samplePath)
    await page.waitForFunction((selector) => {
      const text = document.querySelector(selector)?.textContent || ''
      return /源文件已保存|文件已上传，等待生成 PDF/.test(text)
    }, { timeout: 60_000 }, SELECTORS.uploadStatus)
    await sleep(800)

    await navigate(page, '/jobs', SELECTORS.jobs)
    const href = await page.$eval(`${SELECTORS.jobs} a[href^="/jobs/"]`, (link) => link.getAttribute('href') || '')
    if (!/^\/jobs\/[0-9a-f-]{36}$/i.test(href)) throw new Error(`Invalid task detail route: ${href}`)
    return href
  } finally {
    await rm(samplePath, { force: true })
  }
}

async function favoriteCurrentTask(page) {
  const button = await page.waitForSelector('button[aria-label="收藏任务"]', { visible: true, timeout: 20_000 })
  if (!button) throw new Error('Favorite button was not found.')
  await button.click()
  await page.waitForSelector('button[aria-label="取消收藏"]', { visible: true, timeout: 20_000 })
  await sleep(600)
}

async function composeOverview() {
  const images = await Promise.all(captured.map(async (item) => ({
    ...item,
    dataUrl: `data:image/png;base64,${(await readFile(path.join(outputDirectory, item.file))).toString('base64')}`,
  })))
  const figures = images.map((item) => `
    <figure>
      <figcaption>${item.label}</figcaption>
      <img src="${item.dataUrl}" alt="${item.label}" />
    </figure>`).join('')
  const html = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #eef1f4; color: #172033; font-family: Arial, "Noto Sans CJK SC", sans-serif; }
        body { padding: 28px; }
        header { margin-bottom: 22px; padding: 22px 26px; border: 1px solid #d7dee7; border-radius: 16px; background: white; }
        h1 { margin: 0; font-size: 28px; }
        p { margin: 8px 0 0; color: #667085; font-size: 14px; }
        section { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; align-items: start; }
        figure { min-width: 0; margin: 0; overflow: hidden; border: 1px solid #cfd7e3; border-radius: 16px; background: white; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08); }
        figcaption { padding: 13px 16px; border-bottom: 1px solid #dfe5ec; font-size: 14px; font-weight: 700; }
        img { display: block; width: 100%; height: auto; background: white; }
      </style>
    </head>
    <body>
      <header>
        <h1>Cloudflare Pages 桌面端主要页面</h1>
        <p>${pagesUrl.origin} · commit ${commit} · 不包含移动端截图</p>
      </header>
      <section>${figures}</section>
    </body>
  </html>`

  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 1900, height: 1100, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0))
    await sleep(400)
    await page.screenshot({ path: path.join(outputDirectory, OVERVIEW_FILE), fullPage: true })
  } finally {
    await page.close()
  }
}

const context = await browser.createBrowserContext()
const page = await context.newPage()
const browserErrors = []
let captureError = null

page.setDefaultTimeout(30_000)
page.setDefaultNavigationTimeout(30_000)
await page.setViewport(VIEWPORT)
await page.setCacheEnabled(false)
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
await page.setExtraHTTPHeaders({
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
})
page.on('pageerror', (error) => browserErrors.push(error.message.slice(0, 500)))
page.on('requestfailed', (request) => {
  if (request.url().includes('/assets/')) browserErrors.push(`Asset request failed: ${request.failure()?.errorText || 'unknown'}`)
})

try {
  await installSession(page)
  await capture(page, 'workspace-create-desktop.png', '创建任务 · 单文件', '/workspace', SELECTORS.workspace)
  await captureBatchMode(page)
  const detailRoute = await createSampleTask(page)
  await capture(page, 'jobs-list-desktop.png', '任务列表', '/jobs', SELECTORS.jobs)
  await capture(page, 'job-detail-desktop.png', '任务详情与构建流程', detailRoute, SELECTORS.detail)
  await favoriteCurrentTask(page)
  await capture(page, 'favorites-desktop.png', '收藏任务', '/jobs?status=favorite', SELECTORS.favorites)
  await capture(page, 'settings-desktop.png', '设置', '/settings', SELECTORS.settings)
  await composeOverview()
  diagnostics.push({ status: 'success', detailRoute, browserErrors })
} catch (error) {
  captureError = error
  const diagnosticFile = 'diagnostic-desktop.png'
  await page.screenshot({ path: path.join(outputDirectory, diagnosticFile), fullPage: true }).catch(() => undefined)
  diagnostics.push({ status: 'failed', error: error instanceof Error ? error.message : String(error), browserErrors, screenshot: diagnosticFile })
} finally {
  await context.close()
  await browser.close()
}

await writeFile(path.join(outputDirectory, 'metadata.json'), `${JSON.stringify({
  url: pagesUrl.origin,
  commit,
  runId: process.env.GITHUB_RUN_ID,
  capturedAt: new Date().toISOString(),
  viewport: 'desktop only, 1440x1000',
  temporaryAuthenticatedUser: true,
  screenshots: captured,
  overview: OVERVIEW_FILE,
  diagnostics,
}, null, 2)}\n`)

if (captureError) throw captureError

const expected = [
  'workspace-create-desktop.png',
  'workspace-batch-desktop.png',
  'jobs-list-desktop.png',
  'job-detail-desktop.png',
  'favorites-desktop.png',
  'settings-desktop.png',
  OVERVIEW_FILE,
]
if (!expected.every((file) => file === OVERVIEW_FILE || captured.some((item) => item.file === file))) {
  throw new Error('Not all desktop application pages were captured.')
}

console.log('Captured desktop application pages and composed ui-overview.png.')

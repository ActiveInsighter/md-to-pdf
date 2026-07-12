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

async function settle(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function captureViewport({ name, width, height, mobile }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(30_000)
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

    await page.type('#auth-panel input[type="email"]', credentials.email)
    await page.type('#auth-panel input[type="password"]', credentials.password)
    await page.waitForSelector('#auth-panel button[type="submit"]:not([disabled])', { visible: true })
    await page.click('#auth-panel button[type="submit"]')
    await page.waitForSelector('.workspace-hero', { visible: true, timeout: 30_000 })
    await settle(2_500)

    const authenticatedFile = `authenticated-${name}.png`
    await page.screenshot({
      path: path.join(outputDirectory, authenticatedFile),
      fullPage: true,
    })
    captured.push({ file: authenticatedFile, viewport: `${width}x${height}`, fullPage: true, authenticated: true })
  } finally {
    await context.close()
  }
}

try {
  await captureViewport({ name: 'desktop-1440', width: 1440, height: 1000, mobile: false })
  await captureViewport({ name: 'mobile-390', width: 390, height: 844, mobile: true })
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
}
await writeFile(path.join(outputDirectory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)

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

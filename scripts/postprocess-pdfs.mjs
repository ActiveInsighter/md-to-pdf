import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const projectRoot = process.cwd();
const args = process.argv.slice(2);
const strict = process.env.PDF_POSTPROCESS_STRICT !== 'false';
const previewDpi = Number(process.env.PDF_PREVIEW_DPI || 110);
const timeoutMs = Number(process.env.PUPPETEER_TIMEOUT_MS || 180000);

function argValue(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1].trim();
  }
  return '';
}

const scanRoot = path.resolve(projectRoot, argValue('--root') || 'dist');
const stateOutput = path.resolve(projectRoot, argValue('--state-output') || path.join('.github', 'latest-output.json'));

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relative(filePath) {
  return toPosix(path.relative(projectRoot, filePath));
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || projectRoot,
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe']
  });

  if (result.error) {
    throw new Error(`${command} is unavailable: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${commandArgs.join(' ')} failed with code ${result.status}${details ? `:\n${details}` : ''}`);
  }
  return result;
}

async function listPdfs(dir) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return found;
    throw error;
  }

  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...await listPdfs(target));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      found.push(target);
    }
  }

  return found.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function parsePdfInfo(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) values[match[1].trim().toLowerCase().replace(/\s+/g, '_')] = match[2].trim();
  }
  const pages = Number(values.pages || 0);
  return { raw: values, pages: Number.isInteger(pages) ? pages : 0 };
}

function samplePages(pageCount) {
  if (pageCount <= 4) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const selected = new Set();
  while (selected.size < 4) {
    selected.add(crypto.randomInt(1, pageCount + 1));
  }
  return [...selected].sort((a, b) => a - b);
}

function outputPaths(pdfPath) {
  const stem = pdfPath.replace(/\.pdf$/i, '');
  return {
    html: `${stem}.html`,
    preview: `${stem}.preview.png`,
    quality: `${stem}.quality.json`
  };
}

async function inspectHtml(browser, htmlPath) {
  const consoleErrors = [];
  const pageErrors = [];
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: timeoutMs });
    await page.emulateMediaType('print');
    const diagnostics = await page.evaluate(() => {
      const selectorFor = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
        if (element.id) return `#${element.id}`;
        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
          let part = current.tagName.toLowerCase();
          if (current.classList.length) part += `.${[...current.classList].slice(0, 2).join('.')}`;
          parts.unshift(part);
          current = current.parentElement;
        }
        return parts.join(' > ');
      };

      const missingImages = [...document.images]
        .filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0)
        .map((image) => ({ src: image.getAttribute('src') || '', alt: image.getAttribute('alt') || '' }));

      const overflowElements = [...document.querySelectorAll('main *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === 'inline') return false;
          if (['auto', 'scroll'].includes(style.overflowX)) return false;
          return element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 3;
        })
        .slice(0, 30)
        .map((element) => ({
          selector: selectorFor(element),
          client_width: element.clientWidth,
          scroll_width: element.scrollWidth
        }));

      const main = document.querySelector('main');
      return {
        title: document.title,
        image_count: document.images.length,
        missing_images: missingImages,
        katex_error_count: document.querySelectorAll('.katex-error').length,
        overflow_elements: overflowElements,
        document_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        main_overflow_px: main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0,
        body_text_chars: (document.body.innerText || '').replace(/\s+/g, '').length
      };
    });
    diagnostics.console_errors = consoleErrors;
    diagnostics.page_errors = pageErrors;
    return diagnostics;
  } finally {
    await page.close();
  }
}

async function renderSelectedPages(pdfPath, selectedPages, tempDir) {
  const images = [];
  for (const pageNumber of selectedPages) {
    const prefix = path.join(tempDir, `page-${String(pageNumber).padStart(4, '0')}`);
    run('pdftoppm', [
      '-f', String(pageNumber),
      '-l', String(pageNumber),
      '-singlefile',
      '-png',
      '-r', String(previewDpi),
      pdfPath,
      prefix
    ]);
    const imagePath = `${prefix}.png`;
    const data = await fs.readFile(imagePath);
    images.push({ page: pageNumber, data_uri: `data:image/png;base64,${data.toString('base64')}` });
  }
  return images;
}

async function composePreview(browser, images, pageCount, outputPath, title) {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  const columns = images.length === 1 ? 1 : 2;
  const cardWidth = columns === 1 ? 980 : 820;
  const viewportWidth = columns === 1 ? 1060 : 1740;
  await page.setViewport({ width: viewportWidth, height: 1200, deviceScaleFactor: 1 });

  const cards = images.map((item) => `
    <article class="card">
      <div class="label">第 ${item.page} / ${pageCount} 页</div>
      <img src="${item.data_uri}" alt="PDF 第 ${item.page} 页">
    </article>`).join('\n');

  await page.setContent(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${String(title).replace(/[&<>"']/g, '')}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #eef0f3; font-family: "Noto Sans CJK SC", "Microsoft YaHei UI", sans-serif; }
  .sheet { width: ${viewportWidth}px; padding: 28px; display: grid; grid-template-columns: repeat(${columns}, ${cardWidth}px); gap: 28px; align-items: start; justify-content: center; }
  .card { margin: 0; background: #fff; border: 1px solid #d8dce3; border-radius: 12px; padding: 14px; box-shadow: 0 4px 16px rgba(0,0,0,.08); overflow: hidden; }
  .label { margin: 0 0 10px; font-size: 22px; line-height: 1.35; color: #4b5563; text-align: center; font-weight: 600; }
  img { display: block; width: 100%; height: auto; background: #fff; }
</style>
</head>
<body><main class="sheet">${cards}</main></body>
</html>`, { waitUntil: 'load', timeout: timeoutMs });

  try {
    await page.screenshot({ path: outputPath, type: 'png', fullPage: true, captureBeyondViewport: true });
  } finally {
    await page.close();
  }
}

function buildChecks({ stat, headerValid, pageCount, htmlExists, previewExists, diagnostics, blankPages }) {
  const checks = [];
  const push = (id, status, message, details = undefined) => checks.push({ id, status, message, ...(details === undefined ? {} : { details }) });

  push('pdf-header', headerValid ? 'pass' : 'fail', headerValid ? 'PDF 文件头有效。' : 'PDF 文件头无效。');
  push('pdf-size', stat.size >= 1024 ? 'pass' : 'fail', `PDF 大小为 ${stat.size} 字节。`);
  push('pdf-pages', pageCount > 0 ? 'pass' : 'fail', `PDF 页数为 ${pageCount}。`);
  push('html-sidecar', htmlExists ? 'pass' : 'fail', htmlExists ? 'HTML 旁路文件存在。' : '缺少同名 HTML 文件。');
  push('preview', previewExists ? 'pass' : 'fail', previewExists ? '四页合成预览图已生成。' : '预览图未生成。');
  push('images', diagnostics.missing_images.length === 0 ? 'pass' : 'fail', diagnostics.missing_images.length === 0 ? '所有图片均成功加载。' : `有 ${diagnostics.missing_images.length} 张图片加载失败。`, diagnostics.missing_images);
  push('katex', diagnostics.katex_error_count === 0 ? 'pass' : 'fail', diagnostics.katex_error_count === 0 ? '未检测到 KaTeX 渲染错误。' : `检测到 ${diagnostics.katex_error_count} 个 KaTeX 错误。`);
  push('blank-pages', blankPages.length === 0 ? 'pass' : 'warn', blankPages.length === 0 ? '未检测到疑似空白页。' : `疑似空白页：${blankPages.join(', ')}。`, blankPages);
  push('overflow', diagnostics.overflow_elements.length === 0 && diagnostics.document_overflow_px === 0 ? 'pass' : 'warn', diagnostics.overflow_elements.length === 0 ? '未检测到明显横向溢出。' : `检测到 ${diagnostics.overflow_elements.length} 个可能横向溢出的元素。`, diagnostics.overflow_elements);
  return checks;
}

async function processPdf(browser, pdfPath) {
  const paths = outputPaths(pdfPath);
  const stat = await fs.stat(pdfPath);
  const headerBuffer = Buffer.alloc(5);
  const pdfHandle = await fs.open(pdfPath, 'r');
  try {
    await pdfHandle.read(headerBuffer, 0, 5, 0);
  } finally {
    await pdfHandle.close();
  }
  const headerValid = headerBuffer.toString('ascii') === '%PDF-';
  const pdfInfoResult = run('pdfinfo', [pdfPath]);
  const pdfInfo = parsePdfInfo(pdfInfoResult.stdout);
  if (pdfInfo.pages <= 0) throw new Error(`Unable to determine PDF page count: ${relative(pdfPath)}`);

  let htmlExists = true;
  try {
    await fs.access(paths.html);
  } catch {
    htmlExists = false;
  }
  if (!htmlExists) throw new Error(`Matching HTML file is missing: ${relative(paths.html)}`);

  const diagnostics = await inspectHtml(browser, paths.html);

  const textResult = run('pdftotext', ['-layout', pdfPath, '-']);
  let pageTexts = String(textResult.stdout).split('\f');
  if (pageTexts.at(-1)?.trim() === '') pageTexts.pop();
  while (pageTexts.length < pdfInfo.pages) pageTexts.push('');
  pageTexts = pageTexts.slice(0, pdfInfo.pages);
  const pageTextChars = pageTexts.map((text) => text.replace(/\s+/g, '').length);
  const blankPages = pageTextChars
    .map((chars, index) => ({ chars, page: index + 1 }))
    .filter((item) => item.chars < 8)
    .map((item) => item.page);

  const selectedPages = samplePages(pdfInfo.pages);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-preview-'));
  try {
    const renderedPages = await renderSelectedPages(pdfPath, selectedPages, tempDir);
    await composePreview(browser, renderedPages, pdfInfo.pages, paths.preview, path.basename(pdfPath));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  let previewExists = true;
  try {
    const previewStat = await fs.stat(paths.preview);
    previewExists = previewStat.isFile() && previewStat.size > 1024;
  } catch {
    previewExists = false;
  }

  const checks = buildChecks({
    stat,
    headerValid,
    pageCount: pdfInfo.pages,
    htmlExists,
    previewExists,
    diagnostics,
    blankPages
  });
  const failures = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');
  const status = failures.length > 0 ? 'failure' : warnings.length > 0 ? 'warning' : 'success';

  const report = {
    version: 1,
    status,
    generated_at: new Date().toISOString(),
    run_id: process.env.GITHUB_RUN_ID || null,
    files: {
      pdf: relative(pdfPath),
      html: relative(paths.html),
      preview: relative(paths.preview),
      quality: relative(paths.quality)
    },
    pdf: {
      bytes: stat.size,
      pages: pdfInfo.pages,
      header_valid: headerValid,
      text_chars: pageTextChars.reduce((sum, value) => sum + value, 0),
      page_text_chars: pageTextChars,
      suspected_blank_pages: blankPages,
      metadata: pdfInfo.raw
    },
    render: diagnostics,
    preview: {
      strategy: pdfInfo.pages <= 4 ? 'all-pages' : 'random-four-pages',
      selected_pages: selectedPages,
      total_pages: pdfInfo.pages,
      layout: selectedPages.length === 1 ? '1x1' : selectedPages.length === 2 ? '2x1' : '2x2',
      dpi: previewDpi
    },
    checks
  };

  await fs.writeFile(paths.quality, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Postprocessed ${relative(pdfPath)}: pages=${pdfInfo.pages}, preview=${selectedPages.join(',')}, status=${status}`);

  if (strict && failures.length > 0) {
    throw new Error(`PDF quality checks failed for ${relative(pdfPath)}: ${failures.map((item) => item.id).join(', ')}`);
  }

  return {
    ...report.files,
    bytes: stat.size,
    pages: pdfInfo.pages,
    quality_status: status,
    selected_preview_pages: selectedPages,
    warnings: warnings.map((item) => item.id)
  };
}

async function writeIndex(outputs) {
  const failureCount = outputs.filter((item) => item.quality_status === 'failure').length;
  const warningCount = outputs.filter((item) => item.quality_status === 'warning').length;
  const index = {
    version: 1,
    status: outputs.length === 0 ? 'skipped' : failureCount > 0 ? 'failure' : warningCount > 0 ? 'warning' : 'success',
    generated_at: new Date().toISOString(),
    run_id: process.env.GITHUB_RUN_ID || null,
    artifact_name: 'obsidian-style-pdf',
    scan_root: relative(scanRoot),
    output_count: outputs.length,
    failure_count: failureCount,
    warning_count: warningCount,
    outputs
  };

  await fs.mkdir(path.dirname(stateOutput), { recursive: true });
  await fs.writeFile(stateOutput, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const distRoot = path.resolve(projectRoot, 'dist');
  const queueRoot = path.join(distRoot, 'queue');
  let publishedIndex;
  const scanInsideDist = scanRoot === distRoot || scanRoot.startsWith(`${distRoot}${path.sep}`);
  if (!scanInsideDist) {
    publishedIndex = path.join(scanRoot, 'latest-output.json');
  } else {
    try {
      const queueStat = await fs.stat(queueRoot);
      publishedIndex = queueStat.isDirectory() ? path.join(queueRoot, 'latest-output.json') : path.join(distRoot, 'latest-output.json');
    } catch {
      publishedIndex = path.join(distRoot, 'latest-output.json');
    }
  }
  await fs.mkdir(path.dirname(publishedIndex), { recursive: true });
  await fs.writeFile(publishedIndex, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}

async function main() {
  const pdfs = await listPdfs(scanRoot);
  if (pdfs.length === 0) {
    const index = await writeIndex([]);
    console.log(`No PDF files found under ${relative(scanRoot)}; postprocessing skipped.`);
    console.log(JSON.stringify(index));
    return;
  }

  run('pdfinfo', ['-v']);
  run('pdftoppm', ['-v']);
  run('pdftotext', ['-v']);

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (executablePath) launchOptions.executablePath = executablePath;
  const browser = await puppeteer.launch(launchOptions);

  const outputs = [];
  try {
    for (const pdfPath of pdfs) {
      outputs.push(await processPdf(browser, pdfPath));
    }
  } finally {
    await browser.close();
  }

  const index = await writeIndex(outputs);
  console.log(`PDF postprocessing finished: ${outputs.length} output(s), status=${index.status}.`);
}

main().catch(async (error) => {
  console.error(error);
  try {
    await fs.mkdir(path.dirname(stateOutput), { recursive: true });
    await fs.writeFile(stateOutput, `${JSON.stringify({
      version: 1,
      status: 'failure',
      generated_at: new Date().toISOString(),
      run_id: process.env.GITHUB_RUN_ID || null,
      error: String(error?.message || error)
    }, null, 2)}\n`, 'utf8');
  } catch {}
  process.exit(1);
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { validateMarkdownForRender } from './lib/render-preflight.mjs';

const projectRoot = process.cwd();
const fixture = path.resolve(projectRoot, 'fixtures', 'render-regression.md');
const outputDir = path.resolve(projectRoot, '.tmp', 'render-test');
const outputPdf = path.join(outputDir, 'render-regression.pdf');
const outputHtml = path.join(outputDir, 'render-regression.html');
const outputPreview = path.join(outputDir, 'render-regression.preview.png');
const outputQuality = path.join(outputDir, 'render-regression.quality.json');
const samplingMarkdown = path.join(outputDir, 'preview-sampling.md');
const samplingPdf = path.join(outputDir, 'preview-sampling.pdf');
const samplingPreview = path.join(outputDir, 'preview-sampling.preview.png');
const samplingQuality = path.join(outputDir, 'preview-sampling.quality.json');
const outputIndex = path.join(outputDir, 'latest-output.json');
const stateOutput = path.join(outputDir, 'latest-output-state.json');

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relative(filePath) {
  return toPosix(path.relative(projectRoot, filePath));
}

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function assertFile(filePath, minimumBytes) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < minimumBytes) {
    throw new Error(`${relative(filePath)} is too small: ${stat.size} bytes`);
  }
  return stat.size;
}

async function inspectChineseFractionRendering(htmlPath) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    const timeout = Number(process.env.PUPPETEER_TIMEOUT_MS || 180000);
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout });
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);

    const metrics = await page.evaluate(() => {
      const fractions = [...document.querySelectorAll('.katex-display .mfrac')];
      const fraction = fractions.find((node) => node.querySelector('.cjk_fallback'));
      if (!fraction) throw new Error('Chinese display fraction was not rendered');

      const line = fraction.querySelector('.frac-line');
      if (!line) throw new Error('Chinese display fraction is missing .frac-line');

      const style = getComputedStyle(line);
      const lineRect = line.getBoundingClientRect();
      const matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform);
      const lineCenter = (lineRect.top + lineRect.bottom) / 2;
      const textRects = [...fraction.querySelectorAll('.cjk_fallback')]
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const numeratorRects = textRects.filter((rect) => (rect.top + rect.bottom) / 2 < lineCenter);
      const denominatorRects = textRects.filter((rect) => (rect.top + rect.bottom) / 2 > lineCenter);
      const numeratorBottom = numeratorRects.length > 0
        ? Math.max(...numeratorRects.map((rect) => rect.bottom))
        : null;
      const denominatorTop = denominatorRects.length > 0
        ? Math.min(...denominatorRects.map((rect) => rect.top))
        : null;

      return {
        text: fraction.textContent?.replace(/\s+/g, '') || '',
        border_bottom_width: style.borderBottomWidth,
        background_color: style.backgroundColor,
        transform: style.transform,
        transform_origin: style.transformOrigin,
        scale_y: matrix?.m22 ?? 1,
        layout_height_px: line.offsetHeight,
        rendered_height_px: lineRect.height,
        numerator_gap_px: numeratorBottom == null ? null : lineRect.top - numeratorBottom,
        denominator_gap_px: denominatorTop == null ? null : denominatorTop - lineRect.bottom
      };
    });

    if (!metrics.text.includes('目标字数') || !metrics.text.includes('单片字数')) {
      throw new Error(`Unexpected Chinese fraction text: ${JSON.stringify(metrics)}`);
    }
    if (metrics.border_bottom_width !== '0px') {
      throw new Error(`Fraction border must be disabled: ${JSON.stringify(metrics)}`);
    }
    if (metrics.background_color === 'transparent' || metrics.background_color === 'rgba(0, 0, 0, 0)') {
      throw new Error(`Fraction painted rule is transparent: ${JSON.stringify(metrics)}`);
    }
    if (Math.abs(metrics.scale_y - 0.64) > 0.02) {
      throw new Error(`Unexpected fraction rule scale: ${JSON.stringify(metrics)}`);
    }
    if (metrics.layout_height_px < 1 || metrics.rendered_height_px <= 0 || metrics.rendered_height_px >= metrics.layout_height_px * 0.8) {
      throw new Error(`Fraction rule was not visually thinned while preserving layout height: ${JSON.stringify(metrics)}`);
    }
    if (metrics.numerator_gap_px == null || metrics.denominator_gap_px == null || metrics.numerator_gap_px <= 0 || metrics.denominator_gap_px <= 0) {
      throw new Error(`Fraction rule overlaps Chinese numerator or denominator: ${JSON.stringify(metrics)}`);
    }

    return metrics;
  } finally {
    await browser.close();
  }
}

function samplingDocument() {
  return Array.from({ length: 6 }, (_, index) => {
    const pageNumber = index + 1;
    const pageBreak = index === 0 ? '' : '<div class="page-break"></div>\n\n';
    const title = index === 0 ? '# PDF 随机预览抽样回归\n\n' : '';
    return `${pageBreak}${title}## 第 ${pageNumber} 页\n\n这是用于验证超过四页时随机抽取四页的第 ${pageNumber} 页。\n\n\\[\n${pageNumber}^2 = ${pageNumber ** 2}\n\\]\n`;
  }).join('\n');
}

function validateSamplingReport(report) {
  const selected = report.preview?.selected_pages;
  if (report.pdf?.pages <= 4) {
    throw new Error(`Sampling PDF must have more than four pages: ${JSON.stringify(report.pdf)}`);
  }
  if (report.preview?.strategy !== 'random-four-pages') {
    throw new Error(`Unexpected sampling strategy: ${JSON.stringify(report.preview)}`);
  }
  if (!Array.isArray(selected) || selected.length !== 4 || new Set(selected).size !== 4) {
    throw new Error(`Sampling must select four unique pages: ${JSON.stringify(report.preview)}`);
  }
  if (!selected.every((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= report.pdf.pages)) {
    throw new Error(`Sampled page number is out of range: ${JSON.stringify(report.preview)}`);
  }
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(samplingMarkdown, samplingDocument(), 'utf8');

  await validateMarkdownForRender(fixture, projectRoot);
  await validateMarkdownForRender(samplingMarkdown, projectRoot);

  await runNode('scripts/build-pdf.mjs', [
    relative(fixture),
    relative(outputPdf),
    '--theme',
    'chatgpt-light'
  ]);
  await runNode('scripts/build-pdf.mjs', [
    relative(samplingMarkdown),
    relative(samplingPdf),
    '--theme',
    'chatgpt-light'
  ]);
  await runNode('scripts/postprocess-pdfs.mjs', [
    '--root', relative(outputDir),
    '--state-output', relative(stateOutput)
  ]);

  const htmlSize = await assertFile(outputHtml, 5000);
  const pdfSize = await assertFile(outputPdf, 10000);
  const previewSize = await assertFile(outputPreview, 10000);
  const samplingPdfSize = await assertFile(samplingPdf, 10000);
  const samplingPreviewSize = await assertFile(samplingPreview, 10000);
  await assertFile(outputQuality, 500);
  await assertFile(samplingQuality, 500);
  await assertFile(outputIndex, 200);
  await assertFile(stateOutput, 200);

  const html = await fs.readFile(outputHtml, 'utf8');
  const pdfHeader = (await fs.readFile(outputPdf)).subarray(0, 5).toString('ascii');
  const quality = JSON.parse(await fs.readFile(outputQuality, 'utf8'));
  const samplingReport = JSON.parse(await fs.readFile(samplingQuality, 'utf8'));
  const index = JSON.parse(await fs.readFile(outputIndex, 'utf8'));
  const fractionRendering = await inspectChineseFractionRendering(outputHtml);

  const requiredHtmlMarkers = [
    'class="katex',
    'class="shiki',
    '<table>',
    'render-regression.svg',
    '<blockquote>',
    '[!NOTE]',
    'cjk_fallback',
    'frac-line'
  ];

  for (const marker of requiredHtmlMarkers) {
    if (!html.includes(marker)) {
      throw new Error(`Rendered HTML is missing marker: ${marker}`);
    }
  }

  if (html.includes('class="katex-error"')) {
    throw new Error('Rendered HTML contains a KaTeX error fallback instead of a formula');
  }

  if (pdfHeader !== '%PDF-') {
    throw new Error(`Invalid PDF header: ${JSON.stringify(pdfHeader)}`);
  }
  if (!['success', 'warning'].includes(quality.status)) {
    throw new Error(`Quality report failed: ${JSON.stringify(quality)}`);
  }
  if (!Array.isArray(quality.preview?.selected_pages) || quality.preview.selected_pages.length < 1 || quality.preview.selected_pages.length > 4) {
    throw new Error(`Preview selection is invalid: ${JSON.stringify(quality.preview)}`);
  }

  validateSamplingReport(samplingReport);

  const expectedPreviews = new Set([relative(outputPreview), relative(samplingPreview)]);
  const indexedPreviews = new Set((index.outputs || []).map((item) => item.preview));
  if (index.output_count !== 2 || [...expectedPreviews].some((preview) => !indexedPreviews.has(preview))) {
    throw new Error(`Output index is invalid: ${JSON.stringify(index)}`);
  }

  const report = {
    status: 'success',
    fixture: relative(fixture),
    html: relative(outputHtml),
    pdf: relative(outputPdf),
    preview: relative(outputPreview),
    quality: relative(outputQuality),
    html_bytes: htmlSize,
    pdf_bytes: pdfSize,
    preview_bytes: previewSize,
    pages: quality.pdf.pages,
    selected_preview_pages: quality.preview.selected_pages,
    quality_status: quality.status,
    fraction_rendering: fractionRendering,
    sampling: {
      pdf: relative(samplingPdf),
      preview: relative(samplingPreview),
      quality: relative(samplingQuality),
      pdf_bytes: samplingPdfSize,
      preview_bytes: samplingPreviewSize,
      pages: samplingReport.pdf.pages,
      selected_preview_pages: samplingReport.preview.selected_pages,
      quality_status: samplingReport.status
    },
    checked_at: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  console.log(`Renderer regression passed: ${JSON.stringify(report)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

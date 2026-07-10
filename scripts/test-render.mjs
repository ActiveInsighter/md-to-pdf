import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

function samplingDocument() {
  return Array.from({ length: 6 }, (_, index) => {
    const pageNumber = index + 1;
    const pageBreak = index === 0 ? '' : '<div class="page-break"></div>\n\n';
    const title = index === 0 ? '# PDF 随机预览抽样回归\n\n' : '';
    return `${pageBreak}${title}## 第 ${pageNumber} 页\n\n这是用于验证超过四页时随机抽取四页的第 ${pageNumber} 页。\n\n\[\n${pageNumber}^2 = ${pageNumber ** 2}\n\]\n`;
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

  const requiredHtmlMarkers = [
    'class="katex',
    'class="shiki',
    '<table>',
    'render-regression.svg',
    '<blockquote>',
    '[!NOTE]'
  ];

  for (const marker of requiredHtmlMarkers) {
    if (!html.includes(marker)) {
      throw new Error(`Rendered HTML is missing marker: ${marker}`);
    }
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

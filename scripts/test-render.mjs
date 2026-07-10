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
const outputIndex = path.join(outputDir, 'latest-output.json');
const stateOutput = path.join(outputDir, 'latest-output-state.json');

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
    throw new Error(`${path.relative(projectRoot, filePath)} is too small: ${stat.size} bytes`);
  }
  return stat.size;
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  await validateMarkdownForRender(fixture, projectRoot);
  await runNode('scripts/build-pdf.mjs', [
    path.relative(projectRoot, fixture),
    path.relative(projectRoot, outputPdf),
    '--theme',
    'chatgpt-light'
  ]);
  await runNode('scripts/postprocess-pdfs.mjs', [
    '--root', path.relative(projectRoot, outputDir),
    '--state-output', path.relative(projectRoot, stateOutput)
  ]);

  const htmlSize = await assertFile(outputHtml, 5000);
  const pdfSize = await assertFile(outputPdf, 10000);
  const previewSize = await assertFile(outputPreview, 10000);
  await assertFile(outputQuality, 500);
  await assertFile(outputIndex, 200);
  await assertFile(stateOutput, 200);

  const html = await fs.readFile(outputHtml, 'utf8');
  const pdfHeader = (await fs.readFile(outputPdf)).subarray(0, 5).toString('ascii');
  const quality = JSON.parse(await fs.readFile(outputQuality, 'utf8'));
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
  if (index.output_count !== 1 || index.outputs?.[0]?.preview !== path.relative(projectRoot, outputPreview).split(path.sep).join('/')) {
    throw new Error(`Output index is invalid: ${JSON.stringify(index)}`);
  }

  const report = {
    status: 'success',
    fixture: path.relative(projectRoot, fixture),
    html: path.relative(projectRoot, outputHtml),
    pdf: path.relative(projectRoot, outputPdf),
    preview: path.relative(projectRoot, outputPreview),
    quality: path.relative(projectRoot, outputQuality),
    html_bytes: htmlSize,
    pdf_bytes: pdfSize,
    preview_bytes: previewSize,
    pages: quality.pdf.pages,
    selected_preview_pages: quality.preview.selected_pages,
    quality_status: quality.status,
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

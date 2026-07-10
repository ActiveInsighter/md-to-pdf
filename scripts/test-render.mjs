import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validateMarkdownForRender } from './lib/render-preflight.mjs';

const projectRoot = process.cwd();
const fixture = path.resolve(projectRoot, 'fixtures', 'render-regression.md');
const outputDir = path.resolve(projectRoot, '.tmp', 'render-test');
const outputPdf = path.join(outputDir, 'render-regression.pdf');
const outputHtml = path.join(outputDir, 'render-regression.html');

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

  const htmlSize = await assertFile(outputHtml, 5000);
  const pdfSize = await assertFile(outputPdf, 10000);
  const html = await fs.readFile(outputHtml, 'utf8');
  const pdfHeader = (await fs.readFile(outputPdf)).subarray(0, 5).toString('ascii');

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

  const report = {
    status: 'success',
    fixture: path.relative(projectRoot, fixture),
    html: path.relative(projectRoot, outputHtml),
    pdf: path.relative(projectRoot, outputPdf),
    html_bytes: htmlSize,
    pdf_bytes: pdfSize,
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

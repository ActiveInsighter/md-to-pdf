import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItTaskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const inputFile = args[0] ?? 'notes.md';
const outputPdf = args[1] ?? 'dist/notes.pdf';
const htmlOnly = args.includes('--html-only');

const projectRoot = process.cwd();
const inputPath = path.resolve(projectRoot, inputFile);
const outputPdfPath = path.resolve(projectRoot, outputPdf);
const outputDir = path.dirname(outputPdfPath);
const outputHtmlPath = outputPdfPath.replace(/\.pdf$/i, '.html');
const stylePath = path.resolve(projectRoot, 'style.css');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : path.basename(inputFile);
}

function normalizeObsidianLinks(markdown) {
  return markdown
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alt) => {
      const src = target.trim();
      const text = alt?.trim() || path.basename(src);
      return `![${text}](${src})`;
    })
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
      const label = alias?.trim() || target.trim();
      return label;
    });
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function createMarkdownRenderer() {
  return new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      return `<pre class="hljs"><code class="language-${escapeHtml(language)}">${highlighted}</code></pre>`;
    }
  })
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.headerLink(),
      slugify: s => String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5\-]/g, '')
    })
    .use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true });
}

function buildHtml({ title, renderedMarkdown, customCss, katexCss, highlightCss, katexJs, autoRenderJs }) {
  const baseHref = pathToFileURL(projectRoot + path.sep).href;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${baseHref}">
  <title>${escapeHtml(title)}</title>
  <style>${katexCss}</style>
  <style>${highlightCss}</style>
  <style>${customCss}</style>
</head>
<body>
  <main class="markdown-preview-view markdown-rendered">
${renderedMarkdown}
  </main>
  <script>${katexJs}</script>
  <script>${autoRenderJs}</script>
  <script>
    function enhanceCallouts() {
      document.querySelectorAll('blockquote').forEach((blockquote) => {
        const first = blockquote.querySelector('p, li, div');
        if (!first) return;
        const rawText = first.textContent.trim();
        const match = rawText.match(/^\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|QUESTION|EXAMPLE|QUOTE|BUG|SUCCESS|FAILURE|DANGER)\\]\s*(.*)$/i);
        if (!match) return;

        const type = match[1].toLowerCase();
        const title = match[2] || match[1].toUpperCase();
        blockquote.classList.add('callout', 'callout-' + type);

        const html = first.innerHTML;
        first.innerHTML = html.replace(/^\\[![^\\]]+\\]\s*[^<]*/, '');

        const titleNode = document.createElement('div');
        titleNode.className = 'callout-title';
        titleNode.textContent = title;
        blockquote.prepend(titleNode);
      });
    }

    enhanceCallouts();

    renderMathInElement(document.body, {
      throwOnError: false,
      strict: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
      delimiters: [
        { left: '\\\\[', right: '\\\\]', display: true },
        { left: '\\\\(', right: '\\\\)', display: false },
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ]
    });
  </script>
</body>
</html>`;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const markdownRaw = await fs.readFile(inputPath, 'utf8');
  const markdown = normalizeObsidianLinks(markdownRaw);
  const title = extractTitle(markdown);

  const md = createMarkdownRenderer();
  const renderedMarkdown = md.render(markdown);

  const customCss = await readOptionalFile(stylePath);
  const katexCss = await fs.readFile(path.resolve(projectRoot, 'node_modules/katex/dist/katex.min.css'), 'utf8');
  const katexJs = await fs.readFile(path.resolve(projectRoot, 'node_modules/katex/dist/katex.min.js'), 'utf8');
  const autoRenderJs = await fs.readFile(path.resolve(projectRoot, 'node_modules/katex/dist/contrib/auto-render.min.js'), 'utf8');
  const highlightCss = await fs.readFile(path.resolve(projectRoot, 'node_modules/highlight.js/styles/github-dark.min.css'), 'utf8');

  const html = buildHtml({ title, renderedMarkdown, customCss, katexCss, highlightCss, katexJs, autoRenderJs });
  await fs.writeFile(outputHtmlPath, html, 'utf8');
  console.log(`HTML written to ${path.relative(projectRoot, outputHtmlPath)}`);

  if (htmlOnly) return;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(outputHtmlPath).href, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    await page.pdf({
      path: outputPdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="width:100%; font-size:9px; color:#8a8f98; text-align:center; padding:0 12mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: {
        top: '16mm',
        right: '15mm',
        bottom: '18mm',
        left: '15mm'
      }
    });
    console.log(`PDF written to ${path.relative(projectRoot, outputPdfPath)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

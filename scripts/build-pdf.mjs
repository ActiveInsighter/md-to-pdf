import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItTaskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import katex from 'katex';
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
const themePath = path.resolve(projectRoot, 'themes/obsidian-inspired.css');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function renderKatex(tex, displayMode) {
  return katex.renderToString(tex.trim(), {
    displayMode,
    throwOnError: false,
    strict: false,
    output: 'htmlAndMathml'
  });
}

function protectMath(markdown) {
  const mathItems = [];

  function store(tex, displayMode) {
    const token = `MATHPLACEHOLDER${mathItems.length}TOKEN`;
    mathItems.push({ token, html: renderKatex(tex, displayMode), displayMode });
    return displayMode ? `\n\n${token}\n\n` : token;
  }

  function protectPart(part) {
    return part
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => store(tex, true))
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => store(tex, true))
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => store(tex, false))
      .replace(/(^|[^\\])\$(?!\$)([^$\n]+?)(?<!\\)\$/g, (_, prefix, tex) => `${prefix}${store(tex, false)}`);
  }

  const parts = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  const protectedMarkdown = parts
    .map((part) => (/^```|^~~~/.test(part) ? part : protectPart(part)))
    .join('');

  return { markdown: protectedMarkdown, mathItems };
}

function restoreMath(html, mathItems) {
  let restored = html;

  for (const item of mathItems) {
    const token = escapeHtml(item.token);
    const paragraphPattern = new RegExp(`<p>\\s*${escapeRegExp(token)}\\s*</p>`, 'g');
    restored = restored.replace(paragraphPattern, item.html);
    restored = restored.replaceAll(token, item.html);
  }

  return restored;
}

function rewriteKatexCssUrls(katexCss) {
  const fontsDirUrl = pathToFileURL(path.resolve(projectRoot, 'node_modules/katex/dist/fonts') + path.sep).href;
  return katexCss.replace(/url\(fonts\//g, `url(${fontsDirUrl}`);
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

function buildHtml({ title, renderedMarkdown, customCss, katexCss, highlightCss }) {
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
  <script>
    function enhanceCallouts() {
      document.querySelectorAll('blockquote').forEach((blockquote) => {
        const first = blockquote.querySelector('p, li, div');
        if (!first) return;

        const rawText = first.textContent.trim();
        const firstLine = rawText.split(/\\n/)[0].trim();
        const match = firstLine.match(/^\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|QUESTION|EXAMPLE|QUOTE|BUG|SUCCESS|FAILURE|DANGER)\\]\\s*(.*)$/i);
        if (!match) return;

        const type = match[1].toLowerCase();
        const title = match[2] || match[1].toUpperCase();
        blockquote.classList.add('callout', 'callout-' + type);

        const htmlLines = first.innerHTML.split(/(?:\\r?\\n|<br\\s*\\/?>)/i);
        first.innerHTML = htmlLines.slice(1).join('<br>').trim();

        const titleNode = document.createElement('div');
        titleNode.className = 'callout-title';
        titleNode.textContent = title;
        blockquote.prepend(titleNode);
      });
    }

    enhanceCallouts();
  </script>
</body>
</html>`;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const markdownRaw = await fs.readFile(inputPath, 'utf8');
  const normalizedMarkdown = normalizeObsidianLinks(markdownRaw);
  const title = extractTitle(normalizedMarkdown);
  const protectedMath = protectMath(normalizedMarkdown);

  const md = createMarkdownRenderer();
  const renderedMarkdown = restoreMath(md.render(protectedMath.markdown), protectedMath.mathItems);

  const themeCss = await readOptionalFile(themePath);
  const styleCss = await readOptionalFile(stylePath);
  const customCss = `${themeCss}\n\n${styleCss}`;
  const rawKatexCss = await fs.readFile(path.resolve(projectRoot, 'node_modules/katex/dist/katex.min.css'), 'utf8');
  const katexCss = rewriteKatexCssUrls(rawKatexCss);
  const highlightCss = await fs.readFile(path.resolve(projectRoot, 'node_modules/highlight.js/styles/github-dark.min.css'), 'utf8');

  const html = buildHtml({ title, renderedMarkdown, customCss, katexCss, highlightCss });
  await fs.writeFile(outputHtmlPath, html, 'utf8');
  console.log(`HTML written to ${path.relative(projectRoot, outputHtmlPath)}`);

  if (htmlOnly) return;

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
    console.log(`Using Chrome executable: ${executablePath}`);
  }

  const browser = await puppeteer.launch(launchOptions);

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

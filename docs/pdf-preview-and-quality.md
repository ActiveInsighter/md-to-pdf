# PDF 预览与质量检查

构建链路在生成 PDF 和 HTML 后会自动执行 `scripts/postprocess-pdfs.mjs`，不再需要把整份 PDF 全部渲染后人工检查。

## 生成的文件

每个 `example.pdf` 会在同一目录生成：

```text
example.pdf
example.html
example.preview.png
example.quality.json
```

同时生成统一索引：

```text
.github/latest-output.json
```

队列构建还会把同一份索引写到：

```text
dist/queue/latest-output.json
```

因此索引会随 `dist/**` 一起进入 Artifact，并发布到 `output` 分支根目录。

## 预览图规则

- PDF 页数不超过 4 页：使用全部页面。
- PDF 页数超过 4 页：无放回随机抽取 4 页。
- 抽取结果按页码升序排列。
- 只渲染被选中的页面，不生成其余页面图片。
- 1 页使用 `1x1`，2 页使用 `2x1`，3 至 4 页使用 `2x2`。
- 页面最终合成为一张 PNG，并在每个格子上标注当前页码和总页数。
- 实际抽中的页码记录在 `example.quality.json` 和 `latest-output.json` 中。

默认预览分辨率由环境变量控制：

```text
PDF_PREVIEW_DPI=110
```

## 自动质量检查

质量报告包含：

- PDF 文件头、文件大小和总页数；
- PDF 每页可提取文本量以及疑似空白页；
- HTML 中加载失败的图片；
- KaTeX 渲染错误；
- 可能发生横向溢出的元素；
- 浏览器控制台错误和页面脚本错误；
- 预览图路径、布局以及抽中的页码。

状态分为：

```text
success  所有检查通过
warning  存在疑似空白页或横向溢出等非致命问题
failure  PDF 无效、图片缺失、KaTeX 错误或预览生成失败
```

CI 默认启用严格模式：

```text
PDF_POSTPROCESS_STRICT=true
```

严格模式只会因 `failure` 终止构建，`warning` 会记录在报告中但不会阻止发布。

## 依赖

后处理使用：

- `pdfinfo` 获取 PDF 页数和元数据；
- `pdftotext` 检查逐页文本；
- `pdftoppm` 只渲染抽中的页面；
- Puppeteer 将所选页面合成一张 PNG，并检查 HTML 页面。

GitHub Actions 会安装 `poppler-utils`。本地运行时也需要确保这些命令可用。

## 本地运行

处理默认 `dist/`：

```bash
npm run postprocess:pdf
```

处理指定目录：

```bash
node scripts/postprocess-pdfs.mjs --root .tmp/render-test
```

跳过后处理：

```bash
PDF_POSTPROCESS=false npm run ci:build
```

关闭严格失败：

```bash
PDF_POSTPROCESS_STRICT=false npm run postprocess:pdf
```

## 回归测试

`Renderer Regression` 工作流会在渲染脚本、主题、依赖或测试样例变化时运行。它会验证：

- HTML 和 PDF 正常生成；
- PDF 文件头有效；
- 预览图存在且大小合理；
- 质量报告有效；
- 抽取页数在 1 到 4 页之间；
- 最新产物索引能够准确定位 PDF、HTML、预览图和质量报告。

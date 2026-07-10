# md-to-pdf

把 Markdown 笔记自动渲染为接近 Obsidian 阅读模式的 HTML 和 A4 PDF。

```text
Markdown -> Markdown-it -> KaTeX / Shiki -> HTML + CSS -> Chromium -> PDF
```

默认主题：`chatgpt-light`。

## 快速入口

- AI 与自动化代理：先读 [`AGENTS.md`](AGENTS.md)。
- 可复制的导出提示词：[`docs/ai-export-prompt.md`](docs/ai-export-prompt.md)。
- 完整队列流程：[`docs/workflow-guide.md`](docs/workflow-guide.md)。
- 分支与提交规则：[`docs/branch-policy.md`](docs/branch-policy.md)。
- PDF 预览和质量检查：[`docs/pdf-preview-and-quality.md`](docs/pdf-preview-and-quality.md)。

## 1. 两类任务

### 纯 PDF 导出

只新增 `inbox/**` 时，使用快速路径：

```text
准备全部文件
-> 一个原子提交直接进入 main
-> Actions 构建
-> 自动验收
-> Artifact + output 发布
-> inbox 自动消费
```

直接写入 `main` 被拒绝、发生冲突或目标日期目录已有任务时，回退到 `export/*` 分支和 PR。

### 修改项目

修改脚本、主题、样式、工作流、依赖或文档时，使用 `feature/*`、`fix/*`、`style/*`、`docs/*` 分支与 PR，并运行渲染回归测试。

不要把项目修改和临时导出任务混在同一个提交中。

## 2. 队列目录

```text
inbox/
  YYYY/
    MM/
      YYYY-MM-DD/
        manifest.yml
        md/
          001-第一篇.md
          002-第二篇.md
        img/
          figure-01.svg
        attachments/
          source.pdf
```

Markdown 从 `md/` 引用图片：

```markdown
![示例图片](../img/figure-01.svg)
```

文件名必须兼容 Windows，避免：

```text
\ / : * ? " < > |
```

## 3. manifest 示例

### 多篇合并为一个 PDF

```yaml
version: 1
date: 2026-07-10
title: 学习笔记合集
theme: chatgpt-light

jobs:
  - id: study-notes
    type: merge
    title: 学习笔记合集
    inputs: all
    sort: filename
    page_break: true
    output: 学习笔记合集.pdf
```

### 指定单篇 Markdown

```yaml
version: 1
date: 2026-07-10
title: 单篇讲义
theme: chatgpt-light

jobs:
  - id: single-note
    type: merge
    title: 单篇讲义
    inputs:
      - md/001-单篇讲义.md
    page_break: false
    output: 单篇讲义.pdf
```

### 分别导出多篇 Markdown

```yaml
version: 1
date: 2026-07-10
title: 单篇批量导出
theme: chatgpt-light

jobs:
  - id: separate-notes
    type: single
    inputs: all
    sort: filename
    output_dir: selected
```

正常任务不需要写 `consume`。只有调试时才保留：

```yaml
consume:
  delete_after_success: false
```

## 4. 构建状态与产物

提交后记录导出提交 SHA，只轮询：

```text
.github/latest-run.json
```

确认：

```text
head_sha 与本次导出提交一致
status 为 success
```

成功后读取：

```text
.github/latest-output.json
```

每份输出通常包含：

```text
example.pdf
example.html
example.preview.png
example.quality.json
```

Artifact 名称：

```text
obsidian-style-pdf
```

长期产物位于 `output` 分支：

```text
YYYY/MM/YYYY-MM-DD/文件名.pdf
```

失败时再读取：

```text
.github/latest-build-log.txt
.github/last-build-summary.json
```

## 5. 自动质量检查

构建会检查：

- PDF 文件头、文件大小和页数；
- 疑似空白页；
- 图片加载失败；
- KaTeX 渲染错误；
- 可能的横向溢出；
- 浏览器控制台和页面错误。

PDF 不超过 4 页时预览全部页面；超过 4 页时无放回抽取 4 页，合成为一张 PNG。验收优先看质量报告和这张合成图，不需要重复生成所有页面图片。

## 6. Markdown 规范

支持：

```text
标题、段落、粗体、斜体、删除线、高亮
有序列表、无序列表、任务列表
引用、Callout、表格、链接、图片
KaTeX 数学公式、Shiki 代码高亮
少量原生 HTML 与 Obsidian 双链
```

建议：

- 一级标题作为文档标题；
- 标题层级不要跳跃；
- 表格一般不超过 4 列，长推导放在表格外；
- 代码块注明语言；
- 不依赖远程图片、远程 CSS、iframe 或脚本；
- Mermaid、PlantUML、Excalidraw 先转换为 PNG 或 SVG；
- 强制分页使用 `<div class="page-break"></div>`，但不要滥用。

## 7. 数学公式

行内公式：

```text
\( x^2 + y^2 = r^2 \)
```

块级公式：

```latex
\[
E = mc^2
\]
```

多行公式：

```latex
\[
\begin{aligned}
a^2+b^2 &= c^2 \\
x &= \frac{-b\pm\sqrt{b^2-4ac}}{2a}
\end{aligned}
\]
```

同一文档不要混用多种公式分隔符。

## 8. 本地命令

安装依赖：

```bash
npm ci
```

构建队列：

```bash
npm run build:queue
```

构建某天或指定 manifest：

```bash
npm run build:day -- 2026-07-10
npm run build:day -- inbox/2026/07/2026-07-10/manifest.yml
```

构建单篇：

```bash
npm run build:single -- inbox/2026/07/2026-07-10/md/001-第一篇.md
```

校验 manifest：

```bash
npm run validate:manifest -- inbox/2026/07/2026-07-10/manifest.yml
```

运行渲染回归：

```bash
npm test
```

执行 PDF 后处理：

```bash
npm run postprocess:pdf
```

## 9. 核心规则

- `main` 保存源码、队列和运行状态，不长期保存临时 Markdown 或 PDF。
- `output` 只保存生成产物，不修改源码。
- 纯导出任务使用一个完整原子提交，禁止分文件多次提交。
- 项目修改必须走分支与 PR。
- 构建完成前不要声称 PDF 已生成。
- 最终交付默认提供 PDF 和 Markdown 源文件，不把 Artifact ZIP 当作主要结果。

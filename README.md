# md-to-pdf

把 Markdown 笔记自动渲染成接近 Obsidian 阅读模式风格的 HTML 和 A4 PDF。

核心链路：

```text
Markdown -> HTML -> CSS -> Chromium -> PDF
```

这个仓库最重要的规则只有一句：

```text
把临时 Markdown 任务提交到 main 分支的 inbox 队列；合并到 main 后，GitHub Actions 自动构建 PDF，并把产物发布到 output 分支。
```

---

## 1. 给 AI 看的最短使用说明

当用户让你“把 Markdown 导出为 PDF”“用这个项目构建 PDF”“把多个 md 合并为 PDF”时，不要只修改 README，也不要把 PDF 直接提交到 `main`。

你应该按下面流程操作：

```text
1. 新建临时分支，例如 export/2026-07-04-topic
2. 在该分支写入 inbox/YYYY/MM/YYYY-MM-DD/manifest.yml
3. 在该分支写入 inbox/YYYY/MM/YYYY-MM-DD/md/*.md
4. 如果有图片，写入 inbox/YYYY/MM/YYYY-MM-DD/img/*
5. 如果有源文件或附件，写入 inbox/YYYY/MM/YYYY-MM-DD/attachments/*
6. 提交并合并到 main
7. main 上的 GitHub Actions 被触发，构建 PDF/HTML
8. 构建产物自动发布到 output 分支
9. 构建成功后，main 上对应 inbox 任务目录会被自动删除
```

一句话版：

```text
export/* 临时分支 -> 写 inbox 任务 -> 合并到 main -> Actions 构建 -> output 保存 PDF
```

---

## 2. 分支怎么用

本仓库长期只保留两个核心分支：

```text
main
output
```

### main

`main` 是源码和构建队列分支，保存：

```text
scripts/
themes/
.github/workflows/
docs/
package.json
README.md
临时 inbox 构建任务
```

`main` 不长期保存每天的 Markdown 原文、图片、附件或生成后的 PDF。构建成功后，`inbox` 任务默认会被删除。

### output

`output` 是唯一长期产物分支，保存生成后的：

```text
PDF
HTML
构建日志
构建摘要
```

不要在 `output` 上改源码，也不要把 Markdown 源文件长期放到 `output`。

### 临时分支

日常导出、修复、样式实验建议使用这些临时分支名前缀：

```text
export/*
feature/*
fix/*
style/*
docs/*
test/*
chore/*
```

合并 PR 后，仓库会尝试自动清理已合并的临时分支。详细规则见：

```text
docs/branch-policy.md
docs/workflow-guide.md
```

---

## 3. 合并分支如何触发 PDF 构建

构建 workflow 只监听 `main` 分支上的 push。

也就是说，下面这些操作才会触发自动构建：

```text
临时分支提交 inbox 任务
-> PR 合并到 main
-> main 收到 push
-> .github/workflows/build-pdf.yml 运行
```

自动构建监听的路径是：

```text
inbox/**/manifest.yml
inbox/**/manifest.yaml
inbox/**/manifest.json
inbox/**/md/**
inbox/**/img/**
inbox/**/attachments/**
scripts/**
package.json
.github/workflows/build-pdf.yml
```

因此：

- 只改 `README.md` 不会触发 PDF 构建。
- 只改 `docs/**` 不会触发 PDF 构建。
- 只改 `themes/**` 不会触发历史重建；下一次有 `inbox` 任务进入队列时，会自然使用最新主题样式。
- 想让它真正导出 PDF，必须让 `main` 收到 `inbox/**` 任务或构建脚本相关变更。

---

## 4. 标准目录结构

每一次导出任务都放在一个日期目录里：

```text
inbox/
  2026/
    07/
      2026-07-04/
        manifest.yml
        md/
          001-第一篇.md
          002-第二篇.md
        img/
          figure-01.png
          figure-02.svg
        attachments/
          source.pdf
```

目录日期必须保持一致：

```text
inbox/2026/07/2026-07-04/manifest.yml
```

对应的 `manifest.yml` 里也必须写：

```yaml
date: 2026-07-04
```

Markdown 位于 `md/` 目录时，引用当天图片要这样写：

```markdown
![示例图片](../img/figure-01.png)
```

文件名要兼容 Windows，避免使用：

```text
\ / : * ? " < > |
```

---

## 5. manifest.yml 最小示例

### 多篇 Markdown 合并成一个 PDF

这是最常用的方式：

```yaml
version: 1
date: 2026-07-04
title: 2026-07-04 学习笔记合集
theme: clean

jobs:
  - id: daily-merged
    type: merge
    title: 2026-07-04 学习笔记合集
    inputs: all
    sort: filename
    page_break: true
    output: 2026-07-04-学习笔记合集.pdf
```

含义：

```text
读取 md/ 下所有 Markdown
-> 按文件名排序
-> 每篇之间分页
-> 合并成一个 PDF
```

所以多个 Markdown 文件建议命名为：

```text
001-第一篇.md
002-第二篇.md
003-第三篇.md
```

### 指定几个 Markdown 合并

```yaml
version: 1
date: 2026-07-04
title: 指定内容合集
theme: clean

jobs:
  - id: selected-merged
    type: merge
    title: 指定内容合集
    inputs:
      - md/001-第一篇.md
      - md/003-第三篇.md
    page_break: true
    output: 指定内容合集.pdf
```

### 每篇 Markdown 单独导出 PDF

```yaml
version: 1
date: 2026-07-04
title: 单篇导出任务
theme: clean

jobs:
  - id: selected-single
    type: single
    inputs: all
    sort: filename
    output_dir: selected
```

含义：

```text
md/001-第一篇.md -> selected/001-第一篇.pdf
md/002-第二篇.md -> selected/002-第二篇.pdf
```

---

## 6. manifest 字段速查

### version

```yaml
version: 1
```

必须为 `1`。

### date

```yaml
date: 2026-07-04
```

必须是 `YYYY-MM-DD`，并且要和目录名一致。

### title

```yaml
title: 2026-07-04 学习笔记合集
```

用于构建摘要和页面标题。

### theme

```yaml
theme: clean
```

可选。默认推荐 `clean`。

主题加载顺序是：

```text
themes/base.css
-> themes/<theme>.css
-> style.css
```

例如 `theme: clean` 会加载：

```text
themes/clean.css
```

### jobs

```yaml
jobs:
  - id: daily-merged
    type: merge
    inputs: all
    output: result.pdf
```

每个 manifest 至少要有一个 job。

### id

```yaml
id: daily-merged
```

只能包含字母、数字、点、下划线、连字符，并且必须以字母或数字开头。

### type

```yaml
type: merge
```

支持两种：

```text
merge  合并多个 Markdown，生成一个 PDF
single 分别处理 Markdown，生成一个或多个 PDF
```

### inputs

处理当天 `md/` 目录下所有 Markdown：

```yaml
inputs: all
```

指定文件：

```yaml
inputs:
  - md/001-第一篇.md
  - md/002-第二篇.md
```

### sort

```yaml
sort: filename
```

当 `inputs: all` 时，建议使用 `filename`，按文件名排序。

### page_break

```yaml
page_break: true
```

用于 `merge`，表示每篇 Markdown 之间强制分页。

### output

```yaml
output: 2026-07-04-学习笔记合集.pdf
```

用于指定输出 PDF 文件名，必须以 `.pdf` 结尾。

### output_dir

```yaml
output_dir: selected
```

用于多个 `single` 输出，把多个 PDF 放到一个目录里。

### consume

正常不需要写。构建成功后默认删除对应的 `inbox` 任务。

只有调试时才建议保留任务目录：

```yaml
consume:
  delete_after_success: false
```

失败时不会删除 `inbox` 任务，方便排查。

---

## 7. 构建后去哪里拿 PDF

构建成功后，结果会同时出现在两个地方。

### 位置一：GitHub Actions artifact

Artifact 名称：

```text
obsidian-style-pdf
```

里面通常包含：

```text
dist/**
.github/latest-build-log.txt
.github/last-build-summary.json
```

### 位置二：output 分支

长期保存位置一般是：

```text
output 分支 / YYYY / MM / YYYY-MM-DD / 文件名.pdf
```

例如：

```text
2026/07/2026-07-04/2026-07-04-学习笔记合集.pdf
```

如果构建成功但 `main` 里的 `inbox` 目录消失了，这是正常现象，说明队列任务已经被消费。

---

## 8. 手动运行

先安装依赖：

```bash
npm install
```

### 构建整个队列

```bash
npm run build:queue
```

### 构建某一天

```bash
npm run build:day -- 2026-07-04
```

也可以直接指定 manifest 路径：

```bash
npm run build:day -- inbox/2026/07/2026-07-04/manifest.yml
```

### 构建单篇 Markdown

```bash
npm run build:single -- inbox/2026/07/2026-07-04/md/001-第一篇.md
```

### 校验 manifest

```bash
npm run validate:manifest -- inbox/2026/07/2026-07-04/manifest.yml
```

### 兼容旧入口

旧入口仍然保留：

```bash
npm run build:pdf
npm run build:html
```

旧入口使用：

```text
notes.md -> dist/notes.pdf
```

新任务优先使用 `inbox + manifest` 队列方式，不建议继续把正式内容写到根目录 `notes.md`。

---

## 9. Markdown 写作规范

支持标准 Markdown：

```text
标题
段落
列表
表格
引用
代码块
图片
```

建议结构：

```markdown
# 文档标题

## 一、核心概念

### 1.1 直观理解

### 1.2 正式定义

## 二、典型例题

## 三、易错点总结
```

正文建议：

- 标题层级不要乱跳。
- 段落不要太长，每段只讲一个意思。
- 表格列数建议不超过 4 列。
- 长内容不要硬塞进表格，改用列表。
- 代码块要标明语言名。
- 不要依赖远程图片、远程 CSS、iframe、脚本。
- Mermaid、PlantUML、Excalidraw 等需要额外渲染器的内容，应先转为 PNG/SVG，再放入 `img/` 引用。

代码块示例：

```python
def add(a: int, b: int) -> int:
    return a + b
```

强制分页可以使用：

```html
<div class="page-break"></div>
```

但不要滥用 HTML。

---

## 10. 数学公式规范

推荐使用反斜杠公式写法。

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
a^2 + b^2 &= c^2 \\
x &= \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
\end{aligned}
\]
```

要求：

- 不要在同一篇文档中混用多种公式分隔符。
- 长公式优先使用块级公式。
- 表格里只放短公式，长推导放到表格外。
- 普通文字中提到变量、函数、矩阵、向量、概率、极限、积分等数学表达式，也建议使用行内公式。

---

## 11. Obsidian 风格支持

支持少量 Obsidian 常见写法。

### 高亮

```markdown
==重点内容==
```

### Callout

```markdown
> [!TIP] 学习建议
> 先理解为什么这样做，再记结论。
```

支持的 Callout 类型包括：

```text
NOTE
TIP
IMPORTANT
WARNING
CAUTION
INFO
QUESTION
EXAMPLE
QUOTE
BUG
SUCCESS
FAILURE
DANGER
```

Obsidian 双链会被转成普通文本或图片引用。为了 PDF 稳定，正式内容优先使用标准 Markdown 链接和图片语法。

---

## 12. AI 操作检查清单

AI 在提交任务前必须确认：

- 已经创建 `inbox/YYYY/MM/YYYY-MM-DD/manifest.yml`。
- `manifest.yml` 的 `date` 和目录日期一致。
- 所有 Markdown 都放在 `md/` 目录。
- 多篇 Markdown 已用 `001-`、`002-`、`003-` 控制顺序。
- Markdown 里的图片路径从 `md/` 指向 `../img/...`。
- 图片和附件都放在同一天的 `img/` 或 `attachments/` 目录。
- 输出 PDF 文件名以 `.pdf` 结尾。
- 文件名兼容 Windows。
- 没有把 PDF、HTML、`dist/` 产物提交到 `main`。
- 没有把长期学习资料直接堆在仓库根目录。

---

## 13. 常见错误

### 只改了 README，为什么没有构建 PDF？

因为自动构建不监听 `README.md`。要触发 PDF 构建，需要合并包含 `inbox/**` 任务的分支到 `main`。

### 合并到 main 后，inbox 目录为什么被删了？

这是正常行为。构建、artifact 上传、`output` 分支发布都成功后，队列任务会被消费删除。

### 图片在 PDF 里不显示怎么办？

先检查 Markdown 文件的位置。如果 Markdown 在：

```text
inbox/2026/07/2026-07-04/md/001-第一篇.md
```

图片在：

```text
inbox/2026/07/2026-07-04/img/figure-01.png
```

引用路径应该是：

```markdown
![图片说明](../img/figure-01.png)
```

### 多篇合并顺序错了怎么办？

给文件名加数字前缀，并在 manifest 里写：

```yaml
inputs: all
sort: filename
```

推荐命名：

```text
001-第一章.md
002-第二章.md
003-第三章.md
```

### 想保留 inbox 调试怎么办？

在 manifest 末尾写：

```yaml
consume:
  delete_after_success: false
```

调试完成后应删掉这段，避免 `main` 长期堆积临时内容。

### 想改 PDF 样式怎么办？

修改：

```text
themes/base.css
themes/clean.css
themes/<your-theme>.css
style.css
```

然后下一次提交 `inbox` 任务时会使用新样式。

---

## 14. 给 ChatGPT / Codex 的推荐提示词

把下面这段发给 AI，可以减少它不知道怎么使用项目的问题。

````text
你正在操作 GitHub 仓库 `ActiveInsighter/md-to-pdf`。这个仓库不是直接把 PDF 提交到 main，而是用 `main` 分支的 `inbox` 队列触发 GitHub Actions 构建 PDF。

请按这个流程工作：

1. 新建临时分支，例如 `export/YYYY-MM-DD-topic`。
2. 创建 `inbox/YYYY/MM/YYYY-MM-DD/manifest.yml`。
3. 创建 `inbox/YYYY/MM/YYYY-MM-DD/md/*.md`。
4. 如有图片，放入 `inbox/YYYY/MM/YYYY-MM-DD/img/`，Markdown 中用 `../img/文件名` 引用。
5. 如有附件，放入 `inbox/YYYY/MM/YYYY-MM-DD/attachments/`。
6. 多篇 Markdown 用 `001-`、`002-`、`003-` 控制顺序。
7. 合并导出用 `type: merge`、`inputs: all`、`sort: filename`、`page_break: true`。
8. 每篇单独导出用 `type: single` 和 `output_dir`。
9. 不要把 PDF、HTML、dist 产物提交到 `main`。
10. 合并临时分支到 `main` 后，GitHub Actions 会自动构建，产物在 `output` 分支和 Actions artifact 里。

最小 manifest 示例：

```yaml
version: 1
date: YYYY-MM-DD
title: YYYY-MM-DD 文档标题
theme: clean

jobs:
  - id: daily-merged
    type: merge
    title: YYYY-MM-DD 文档标题
    inputs: all
    sort: filename
    page_break: true
    output: YYYY-MM-DD-文档标题.pdf
```
````

---

## 15. 项目脚本

`package.json` 中的主要脚本：

```text
npm run build:queue          构建整个 inbox 队列
npm run build:day            构建某一天或某个 manifest
npm run build:single         构建单篇 Markdown
npm run validate:manifest    校验 manifest
npm run cleanup:branches     清理已合并临时分支
npm run ci:build             GitHub Actions 使用的构建入口
npm run build:pdf            旧入口：notes.md -> dist/notes.pdf
npm run build:html           旧入口：notes.md -> dist/notes.html
```

GitHub Actions 默认使用：

```text
npm run ci:build
```

---

## 16. 推荐的一次完整提交示例

目标：把两篇 Markdown 合并成一个 PDF。

```text
export/2026-07-04-review
  inbox/2026/07/2026-07-04/manifest.yml
  inbox/2026/07/2026-07-04/md/001-数据结构.md
  inbox/2026/07/2026-07-04/md/002-操作系统.md
  inbox/2026/07/2026-07-04/img/tree.png
```

`manifest.yml`：

```yaml
version: 1
date: 2026-07-04
title: 2026-07-04 408 复习笔记
theme: clean

jobs:
  - id: daily-merged
    type: merge
    title: 2026-07-04 408 复习笔记
    inputs: all
    sort: filename
    page_break: true
    output: 2026-07-04-408复习笔记.pdf
```

合并到 `main` 后，PDF 会生成到：

```text
output 分支 / 2026 / 07 / 2026-07-04 / 2026-07-04-408复习笔记.pdf
```

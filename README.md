# Obsidian Style PDF Action

这个仓库用于把 Markdown 笔记自动导出为接近 Obsidian 阅读模式风格的 PDF。

核心流程：

```text
Markdown -> HTML -> CSS -> Chromium -> PDF
```

## 分支结构

本仓库只长期保留两个核心分支：

```text
main
output
```

`main` 是源码和构建队列分支，只保存构建脚本、样式、workflow、文档和临时 `inbox` 任务。`main` 不长期保存每天的 Markdown 原文、图片、附件或生成后的 PDF。

`output` 是唯一长期产物分支，用来保存生成后的 PDF、HTML 和构建日志。不要在 `output` 上改源码。

临时开发或导出分支建议使用：

```text
feature/*
fix/*
style/*
docs/*
test/*
export/*
chore/*
```

PR 合并后，`cleanup-branches` workflow 会自动删除符合规则的同仓库临时分支，并保护 `main`、`output` 等长期分支。

详细规则见：

```text
docs/branch-policy.md
docs/workflow-guide.md
```

## 当前推荐工作流：manifest 构建队列

仓库现在支持把 `main` 当作“构建队列”使用：

```text
内容分支 -> PR / 合并到 main -> Action 读取 inbox 里的 manifest -> 生成 PDF/HTML -> 发布到 output 分支 -> 成功后删除 inbox 任务 -> 删除已合并临时分支
```

`main` 不再需要长期保存每天的 Markdown 原始内容。每天的临时任务放到 `inbox/` 下，构建成功后默认自动消费删除。

推荐目录：

```text
inbox/
  2026/
    07/
      2026-07-02/
        manifest.yml
        md/
          001-条件熵与信息增益.md
          002-PCA协方差矩阵.md
        img/
          entropy.png
          pca.png
        attachments/
          source.pdf
```

Markdown 中引用当天图片时，建议从 `md/` 指向 `img/`：

```markdown
![示例图片](../img/entropy.png)
```

## manifest.yml 规范

每个日期目录必须有一个 manifest 文件，文件名只能是：

```text
manifest.yml
manifest.yaml
manifest.json
```

推荐使用 `manifest.yml`。

最小示例：

```yaml
version: 1
date: 2026-07-02
title: 2026-07-02 机器学习复习

jobs:
  - id: daily-merged
    type: merge
    title: 2026-07-02 机器学习复习合集
    inputs: all
    sort: filename
    page_break: true
    output: 2026-07-02-机器学习复习合集.pdf
```

完整示例见：

```text
docs/manifest.example.yml
```

### 字段说明

```yaml
version: 1
```

必须为 `1`。

```yaml
date: 2026-07-02
```

日期必须是 `YYYY-MM-DD`，并且要和目录 `inbox/YYYY/MM/YYYY-MM-DD/` 一致。

```yaml
jobs:
```

构建任务数组，至少一个。

每个 job 支持：

```yaml
id: daily-merged
```

任务 ID，只能包含字母、数字、点、下划线、连字符，并且必须以字母或数字开头。

```yaml
type: single
```

或：

```yaml
type: merge
```

`single` 表示把选中的 Markdown 分别转成 PDF；`merge` 表示把选中的 Markdown 按顺序拼成一个 PDF。

```yaml
inputs: all
```

表示处理当天 `md/` 目录下所有 Markdown。

也可以指定某一个或几个：

```yaml
inputs:
  - md/001-条件熵与信息增益.md
  - md/002-PCA协方差矩阵.md
```

```yaml
sort: filename
```

当 `inputs: all` 时，建议使用 `filename`，即按文件名排序。指定数组时默认按 manifest 中的顺序。

```yaml
output: 2026-07-02-合集.pdf
```

用于 `merge`，也可以用于只有一个输入的 `single`。

```yaml
output_dir: selected
```

用于多个输入的 `single`，会把多个 PDF 输出到这个目录下。

```yaml
page_break: true
```

用于 `merge`，表示每篇 Markdown 之间分页。

### consume 策略

默认不需要写 `consume`。构建成功、artifact 上传成功、`output` 分支发布成功后，Action 会删除对应的 `inbox/YYYY/MM/YYYY-MM-DD/` 任务目录。

只有调试时才建议显式保留任务目录：

```yaml
consume:
  delete_after_success: false
```

失败时不会删除 `inbox` 任务，方便排查。

## GitHub Actions 行为

`main` 分支的自动构建只监听：

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

单独修改 `style.css` 或 `themes/**` 不会触发历史重建。下一次有 manifest 任务进入队列时，会自然使用最新样式。

构建结果会：

```text
1. 上传到 Actions artifact: obsidian-style-pdf
2. 发布到 output 分支，按日期长期保存
3. 默认删除 main 上对应 inbox 任务目录
```

## 手动运行

### 构建队列

```bash
npm run build:queue
```

### 构建某一天

```bash
npm run build:day -- 2026-07-02
```

或者：

```bash
npm run build:day -- inbox/2026/07/2026-07-02/manifest.yml
```

### 构建单篇 Markdown

```bash
npm run build:single -- inbox/2026/07/2026-07-02/md/001-条件熵与信息增益.md
```

### 校验 manifest

```bash
npm run validate:manifest -- inbox/2026/07/2026-07-02/manifest.yml
```

### 清理已合并临时分支

```bash
npm run cleanup:branches
```

### 兼容旧入口

仍然保留旧入口：

```bash
npm run build:pdf
npm run build:html
```

旧入口继续使用：

```text
notes.md -> dist/notes.pdf
```

## 给 AI 的 Markdown 写作提示词

把下面整段提示词发给 AI。它的作用不是让 AI 写普通聊天回答，而是让 AI 生成能被本仓库稳定导出 PDF 的 Markdown 内容和 manifest 任务。

````text
你是本仓库 `ActiveInsighter/md-to-pdf` 的 Markdown/PDF 内容生成助手。你的输出必须能被仓库的 manifest 构建队列稳定转换成 HTML 和 A4 PDF。

仓库的推荐工作流是：把临时构建任务放入 `main` 分支的 `inbox/YYYY/MM/YYYY-MM-DD/` 目录；GitHub Actions 会读取 `manifest.yml`，把 Markdown 转成 PDF/HTML，发布到 `output` 分支；构建成功后会默认删除 `main` 上对应的 `inbox` 任务目录。

一、你要交付什么

1. 如果用户让你“写 Markdown 并导出 PDF”，你应该创建或给出下面这些文件：

```text
inbox/YYYY/MM/YYYY-MM-DD/
  manifest.yml
  md/
    001-主题名.md
    002-主题名.md
  img/
    image-name.png
  attachments/
    source.pdf
```

2. 如果只有一篇内容，也仍然推荐放在 `md/001-主题名.md`，并配套一个 `manifest.yml`。
3. 如果有多篇内容，文件名必须用 `001-`、`002-`、`003-` 这种前缀控制顺序。
4. 文件名要兼容 Windows，不要包含 `\`、`/`、`:`、`*`、`?`、`"`、`<`、`>`、`|`。
5. 图片只能引用仓库内的相对路径。Markdown 文件位于 `md/` 目录时，引用当天图片应写成：

```markdown
![图片说明](../img/example.png)
```

二、manifest.yml 必须这样写

单篇或多篇合并成一个 PDF 时，优先使用：

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

如果用户明确要求每篇 Markdown 单独导出 PDF，使用：

```yaml
version: 1
date: YYYY-MM-DD
title: YYYY-MM-DD 文档标题
theme: clean

jobs:
  - id: selected-single
    type: single
    inputs: all
    sort: filename
    output_dir: selected
```

注意：

- `date` 必须等于目录名里的日期，例如 `inbox/2026/07/2026-07-03/manifest.yml` 中的 `date` 必须是 `2026-07-03`。
- `output` 必须以 `.pdf` 结尾。
- `id` 只能用字母、数字、点、下划线、连字符，并且以字母或数字开头。
- 默认不要写 `consume`；只有调试失败任务时才写：

```yaml
consume:
  delete_after_success: false
```

三、Markdown 内容规范

1. 必须使用标准 Markdown：标题、段落、列表、表格、引用、代码块、图片。
2. 标题从 `#` 开始，层级不要乱跳。推荐结构：

```markdown
# 文档标题

## 一、核心概念

### 1.1 直观理解

### 1.2 数学形式

## 二、典型例题

## 三、易错点总结
```

3. 正文要适合 PDF 阅读：段落不要太长，每段尽量只讲一个意思。
4. 用有序列表表达步骤，用无序列表表达并列要点。
5. 表格只放适合横向比较的内容。表格列数建议不超过 4 列；如果内容很长，改用列表，不要硬塞进表格。
6. 代码必须使用带语言名的围栏代码块，例如：

```python
def add(a: int, b: int) -> int:
    return a + b
```

7. 不要生成复杂 HTML、外链 CSS、脚本、iframe 或依赖远程资源的内容。
8. 不要直接写 Mermaid、PlantUML、Excalidraw 等需要额外渲染器的代码块。流程图、结构图、函数图应先转成 PNG/SVG 放到 `img/`，再用 Markdown 图片语法引用。
9. 可以少量使用 `<br>` 控制空行，也可以在确实需要强制分页时使用：

```html
<div class="page-break"></div>
```

但不要滥用 HTML。

四、数学公式规范

1. 行内公式统一使用 `\( ... \)`，例如：`\( x^2 + y^2 = r^2 \)`。
2. 块级公式统一使用：

```latex
\[
E = mc^2
\]
```

3. 多行推导统一使用：

```latex
\[
\begin{aligned}
a^2 + b^2 &= c^2 \\
x &= \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
\end{aligned}
\]
```

4. 不要在同一篇文档中混用多种公式分隔符。
5. 长公式不要强塞进行内公式，应改成块级公式。
6. 表格里尽量只放短公式；长推导放在表格外。
7. 普通文字中提到变量、函数、矩阵、向量、概率、极限、积分等数学表达式，也要使用行内公式。

五、Obsidian 风格支持

本项目支持一部分 Obsidian 常见写法，但要节制使用。

可以使用高亮：

```markdown
==重点内容==
```

可以使用 Callout：

```markdown
> [!TIP] 学习建议
> 先理解为什么这样做，再记结论。
```

支持的 Callout 类型包括：`NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION`、`INFO`、`QUESTION`、`EXAMPLE`、`QUOTE`、`BUG`、`SUCCESS`、`FAILURE`、`DANGER`。

Obsidian 双链会被转成普通文本或图片引用；为了 PDF 稳定，普通文章中优先使用标准 Markdown 链接和图片语法。

六、写作质量要求

1. 先讲直观理解，再讲正式定义，再讲例子，最后总结易错点。
2. 面向学习资料时，要把“为什么”“怎么用”“什么时候不能用”讲清楚。
3. 面向计算题时，要保留关键步骤，不要只给结论。
4. 面向代码资料时，要给可运行代码、输入输出说明和常见错误。
5. 每个大节结尾可以给一个“小结”，方便 PDF 复习。
6. 不要为了好看堆砌 emoji。正式学习资料默认不使用 emoji。

七、输出格式要求

如果你是在聊天中交付内容，按下面顺序输出：

1. `manifest.yml` 的完整内容。
2. 每个 Markdown 文件的完整内容，标明相对路径。
3. 图片或附件清单，说明应该放到哪个目录。
4. 如果需要提交到 GitHub，直接创建这些文件；不要把长期内容放到仓库根目录，不要把产物提交到 `main`。

如果你是在 GitHub 仓库里直接操作：

1. 新建临时分支，例如 `export/YYYY-MM-DD-topic`。
2. 写入 `inbox/YYYY/MM/YYYY-MM-DD/manifest.yml`。
3. 写入 `inbox/YYYY/MM/YYYY-MM-DD/md/*.md`。
4. 图片写入 `inbox/YYYY/MM/YYYY-MM-DD/img/`。
5. 提交后开 PR 到 `main`，或按用户要求直接合并到 `main`。
6. 构建产物应由 Action 发布到 `output`，不要手动把 PDF、HTML、dist 产物提交到 `main`。

八、最小可用示例

`inbox/2026/07/2026-07-03/manifest.yml`：

```yaml
version: 1
date: 2026-07-03
title: 2026-07-03 无穷级数与定积分
theme: clean

jobs:
  - id: daily-merged
    type: merge
    title: 2026-07-03 无穷级数与定积分
    inputs: all
    sort: filename
    page_break: true
    output: 2026-07-03-无穷级数与定积分.pdf
```

`inbox/2026/07/2026-07-03/md/001-无穷级数与定积分.md`：

```markdown
# 无穷级数与定积分

## 一、核心直觉

很多数列和式极限可以写成定积分，本质原因是它们长得像“很多个小矩形面积的总和”。

当每一项都能写成 `\( f(x_i)\Delta x \)` 的形式，并且这些小区间把某个区间切得越来越细时，就可以想到黎曼和：

\[
\sum_{i=1}^{n} f(x_i)\Delta x \to \int_a^b f(x)\,dx
\]

## 二、识别模板

如果看到

\[
\lim_{n \to \infty} \frac{1}{n}\sum_{i=1}^{n} f\left(\frac{i}{n}\right)
\]

就优先识别为

\[
\int_0^1 f(x)\,dx
\]

## 三、易错点

> [!WARNING] 注意
> 不是所有求和极限都能直接写成定积分。只有当它能稳定改写成“函数值乘小区间长度”的形式时，才适合用黎曼和。
```
````

## 支持的常用语法

### 标题、表格、代码块

普通 Markdown 语法都可以使用。

### 数学公式

推荐使用更稳定、可读性更好的反斜杠公式写法：

```text
行内公式：\( x^2 + y^2 = r^2 \)

块级公式：
\[
E = mc^2
\]
```

旧内容中的美元符号公式也兼容，但新写 Markdown 建议统一使用上面的写法，不要混用。

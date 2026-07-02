# Obsidian Style PDF Action

这个仓库用于把 Markdown 笔记自动导出为接近 Obsidian 阅读模式风格的 PDF。

核心流程：

```text
Markdown -> HTML -> CSS -> Chromium -> PDF
```

## 当前推荐工作流：manifest 构建队列

仓库现在支持把 `main` 当作“构建队列”使用：

```text
内容分支 -> PR / 合并到 main -> Action 读取 inbox 里的 manifest -> 生成 PDF/HTML -> 发布到 output 分支 -> 成功后删除 inbox 任务
```

`main` 不再需要长期保存每天的 Markdown 原始内容。每天的临时任务放到 `inbox/` 下，构建成功后可以自动消费删除。

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

consume:
  delete_after_success: true
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

```yaml
consume:
  delete_after_success: true
```

只有构建成功、artifact 上传成功、`output` 分支发布成功后，Action 才会删除对应的 `inbox/YYYY/MM/YYYY-MM-DD/` 任务目录。失败时不会删除。

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
3. 如果 manifest 允许消费，则删除 main 上对应 inbox 任务目录
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

## 支持的常用语法

### 标题、表格、代码块

普通 Markdown 语法都可以使用。

### 数学公式

支持 Obsidian 常见的公式写法：

```text
行内公式：\( x^2 + y^2 = r^2 \)

块级公式：
\[
E = mc^2
\]
```

也兼容美元符号公式。

### Obsidian Callout

```markdown
> [!NOTE] 提示
> 这是一个提示块。

> [!IMPORTANT] 重点
> 这是一个重点块。
```

### 图片

队列模式下，图片建议放在当天的 `img/` 文件夹中，然后在 Markdown 中引用：

```markdown
![示例图片](../img/example.png)
```

旧 `notes.md` 模式也仍然支持根目录 `images/` 引用。

## 注意

- 构建关键是 `manifest`，不是扫描全部历史 Markdown。
- 构建成功后才会消费删除 `inbox` 任务目录。
- 不要只依赖 artifact 长期保存 PDF，正式产物会发布到 `output` 分支。
- 如果要全量重建历史 PDF，建议手动运行 workflow，而不是让 CSS 修改自动触发。

# PDF 队列工作流

这个仓库的推荐使用方式是：内容临时进入 `main` 的 `inbox` 队列，生成结果长期保存到 `output` 分支。

## 标准流程

```text
export/* 分支
  -> 添加 inbox 日期任务
  -> 提 PR 到 main
  -> 合并 PR
  -> GitHub Actions 构建 PDF/HTML
  -> 发布到 output 分支
  -> 删除 main 上的 inbox 日期目录
  -> 自动删除已合并的临时分支
```

## 目录规范

```text
inbox/
  2026/
    07/
      2026-07-02/
        manifest.yml
        md/
          001-综合测试.md
        img/
          diagram.svg
        attachments/
          source.pdf
```

Markdown 中引用图片时，建议从 `md/` 指向 `img/`：

```markdown
![示意图](../img/diagram.svg)
```

## manifest 最小示例

```yaml
version: 1
date: 2026-07-02
title: 2026-07-02 综合测试

theme: clean

jobs:
  - id: merged
    type: merge
    title: 2026-07-02 综合测试
    inputs: all
    sort: filename
    page_break: true
    output: 2026-07-02-综合测试.pdf
```

默认情况下，构建成功后会删除对应的 `inbox` 日期目录；也就是说 `main` 不保存这些临时内容。

## 主题选择

CSS 加载顺序是：

```text
themes/base.css
  -> themes/<theme>.css
  -> style.css
```

推荐默认主题：

```yaml
theme: clean
```

也可以在某个 job 上覆盖：

```yaml
jobs:
  - id: soft-preview
    type: merge
    theme: soft
    inputs: all
    output: soft-preview.pdf
```

`theme` 对应 `themes/<theme>.css`。例如 `theme: clean` 会加载 `themes/clean.css`，`theme: soft` 会加载 `themes/soft.css`。

## 临时保留 inbox

只有调试时才建议这样写：

```yaml
consume:
  delete_after_success: false
```

正常导出 PDF 不需要写这一段。

## 输出位置

构建完成后，结果会同时出现在：

1. GitHub Actions artifact：`obsidian-style-pdf`
2. `output` 分支：按日期保存 PDF、HTML 和日志

队列任务输出路径一般是：

```text
output 分支根目录 / YYYY / MM / YYYY-MM-DD / 文件名.pdf
```

例如：

```text
2026/07/2026-07-02/2026-07-02-综合测试.pdf
```

## 分支命名建议

导出任务：

```text
export/YYYY-MM-DD-topic
```

功能开发：

```text
feature/topic
```

修复：

```text
fix/topic
```

样式实验：

```text
style/topic
```

这些临时分支合并后会自动删除。

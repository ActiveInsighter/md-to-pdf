# PDF 队列工作流

这个仓库把临时 Markdown 任务送入 `main` 的 `inbox` 队列，生成结果长期发布到 `output` 分支。

## 1. 两条执行路径

### 1.1 纯导出快速路径

只新增 `inbox/**`，不修改项目源码、主题、工作流或文档时：

```text
一次性准备 manifest + Markdown + 图片
-> 一个原子 Git 提交直接写入 main
-> GitHub Actions 构建 PDF/HTML
-> 自动质量检查与合成预览
-> Artifact 上传
-> 发布到 output
-> 消费并删除 inbox 任务
```

原子提交应使用：

```text
create_blob × N
-> create_tree
-> create_commit
-> update_ref(force=false)
```

不要把同一任务拆成多次 `create_file`。如果直接更新 `main` 被拒绝、`main` 已移动且重试仍失败，或目标日期目录已有未消费任务，则回退到 `export/*` 分支与 PR。

### 1.2 项目修改安全路径

涉及 `scripts/**`、`themes/**`、`style.css`、工作流、依赖、README 或 `docs/**` 时：

```text
feature/*、fix/*、style/* 或 docs/* 分支
-> 单个完整提交或少量逻辑提交
-> PR
-> 渲染回归测试
-> 合并 main
```

项目修改和临时 `inbox` 导出任务不要混在同一个提交里。

## 2. 目录规范

```text
inbox/
  2026/
    07/
      2026-07-10/
        manifest.yml
        md/
          001-综合测试.md
        img/
          diagram.svg
        attachments/
          source.pdf
```

Markdown 引用当天图片：

```markdown
![示意图](../img/diagram.svg)
```

同一日期目录在上一个任务被消费前不要覆盖。文件名必须兼容 Windows，避免使用：

```text
\ / : * ? " < > |
```

## 3. manifest 最小示例

```yaml
version: 1
date: 2026-07-10
title: Markdown 综合测试
theme: chatgpt-light

jobs:
  - id: markdown-test
    type: merge
    title: Markdown 综合测试
    inputs: all
    sort: filename
    page_break: true
    output: Markdown综合测试.pdf
```

默认主题是 `chatgpt-light`。正常导出不需要写 `consume`；成功发布后日期目录会自动删除。

调试时才保留任务：

```yaml
consume:
  delete_after_success: false
```

## 4. 高效状态跟踪

提交任务后记录导出提交 SHA，只轮询：

```text
.github/latest-run.json
```

必须同时满足：

```text
latest-run.head_sha == 本次导出提交 SHA
latest-run.status == success
```

不要通过重复搜索提交记录判断是否构建完成。建议每隔 5 至 10 秒检查一次。

状态成功后读取：

```text
.github/latest-output.json
```

该索引记录 PDF、HTML、合成预览图、质量报告和对应的 `run_id`。然后只下载一次名为 `obsidian-style-pdf` 的 Artifact。

只有失败时才读取：

```text
.github/latest-build-log.txt
.github/last-build-summary.json
```

## 5. 输出与验收

构建结果同时存在于：

1. GitHub Actions Artifact：`obsidian-style-pdf`；
2. `output` 分支：`YYYY/MM/YYYY-MM-DD/`；
3. `.github/latest-output.json` 和 `output` 分支根目录的最新产物索引。

每个 PDF 通常对应：

```text
example.pdf
example.html
example.preview.png
example.quality.json
```

PDF 不超过 4 页时预览全部页面；超过 4 页时只抽取 4 页并合成一张图片。验收以质量报告和这张合成预览图为主，不需要重新渲染全部页面。

## 6. 分支命名

项目修改：

```text
feature/topic
fix/topic
style/topic
docs/topic
test/topic
```

纯导出回退路径：

```text
export/YYYY-MM-DD-topic
```

临时分支合并后由清理工作流自动删除。

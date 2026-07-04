# 大 Markdown 上传与完整性校验

当 Markdown 很长时，不建议让 AI 通过一次 `create_file` / `update_file` 调用把整篇内容写进 GitHub。

原因是这条链路不是普通的 `git push`：

```text
用户上传文件
-> AI 读取或总结文件
-> AI 把完整文本作为工具参数传给 GitHub 连接器
-> 连接器调用 GitHub Contents API 创建或替换文件
```

这里至少有三类风险：

1. AI 没有完整读取到上传文件，只读取了前几段或若干片段。
2. 单次工具参数过大，长文本可能被截断、压缩或丢失中间部分。
3. 即使 GitHub 成功提交，仓库里保存的也可能已经是残缺文本；构建脚本读取仓库文件时无法知道它原本应该有多长。

GitHub Contents API 的定位是创建或替换 Base64 编码的仓库内容，不等价于本地 `git push` 大文件工作流。官方文档也说明，Repository contents API 对文件大小有分档限制：小于等于 1 MB 时功能完整，1 到 100 MB 时只有部分读取方式支持，大于 100 MB 不支持。

## 推荐方案一：大文件分片上传

如果一篇 Markdown 很长，优先拆成多个小文件：

```text
inbox/2026/07/2026-07-04/
  manifest.yml
  md/
    001-计算机组成原理.part001.md
    002-计算机组成原理.part002.md
    003-计算机组成原理.part003.md
    004-计算机组成原理.part004.md
```

manifest 使用 `merge`，并关闭分页：

```yaml
version: 1
date: 2026-07-04
title: 计算机组成原理合并导出
theme: clean

jobs:
  - id: coa-merged
    type: merge
    title: 计算机组成原理合并导出
    inputs: all
    sort: filename
    page_break: false
    output: 计算机组成原理合并导出.pdf
```

这样做的好处：

- 每次工具调用只上传一小段，失败概率低。
- 哪一段漏了，可以单独补传。
- `sort: filename` 可以保证 `001`、`002`、`003` 顺序稳定。
- `page_break: false` 可以避免每个分片之间强制分页。

建议每个分片控制在几十 KB 到几百 KB，不要把几 MB 的正文塞进一次工具调用。

## 推荐方案二：给文件加结束标记

在每个 Markdown 文件最后加一个结束标记，例如：

```markdown
<!-- END: 计算机组成原理合并版 -->
```

然后在 `manifest.yml` 里写 `content_checks`：

```yaml
content_checks:
  - path: md/001-计算机组成原理.part001.md
    min_bytes: 50000
    must_contain:
      - 第1章
      - 第2章
    must_end_with: "<!-- END: part001 -->"

  - path: md/002-计算机组成原理.part002.md
    min_bytes: 50000
    must_contain:
      - 第3章
      - 第4章
    must_end_with: "<!-- END: part002 -->"
```

如果上传被截断，构建会在生成 PDF 前失败，而不是继续生成残缺 PDF。

## 推荐方案三：使用 SHA-256 强校验

如果本地能算出原始文件的 SHA-256，可以写：

```yaml
content_checks:
  - path: md/001-计算机组成原理.md
    sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

构建前会计算仓库内文件的 SHA-256。只要少一个字符、多一个字符、换行不一致，都会失败。

这适合最终确认版，但对 AI 分片编辑不太方便，因为每次修改内容后都要重新计算哈希。

## 推荐方案四：AI 必须先校验再构建

让 AI 操作本项目时，可以直接给它这段要求：

```text
如果上传的 Markdown 很长，不要一次性写入一个大 md 文件。
请按 001、002、003 拆成多个小 md 文件，manifest 使用 type: merge、inputs: all、sort: filename、page_break: false。
每个分片末尾添加唯一 END 标记，并在 manifest.yml 中写 content_checks，至少检查 min_bytes、must_contain、must_end_with。
构建前必须确认每个分片都已经提交成功，不要在源文件不完整时生成 PDF。
```

## content_checks 支持字段

```yaml
content_checks:
  - path: md/example.md
    min_bytes: 1000
    min_chars: 500
    sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    must_contain:
      - 必须出现的文字
    must_not_contain:
      - 不应该出现的文字
    must_end_with: "<!-- END -->"
```

字段说明：

- `path`：必填。相对于当天 `inbox/YYYY/MM/YYYY-MM-DD/` 目录。
- `min_bytes`：文件至少多少字节。
- `min_chars`：文件至少多少字符。
- `sha256`：文件完整 SHA-256。
- `must_contain`：必须包含的文本，可以写字符串或数组。
- `must_not_contain`：不能包含的文本，可以写字符串或数组。
- `must_end_with`：文件去掉末尾空白后必须以这段文本结尾。

任意检查失败都会让构建失败。

## 什么时候不要用 AI 连接器上传正文

下面情况优先用本地 `git push`、GitHub 网页上传、GitHub CLI 或分片上传：

- 单个 Markdown 超过几百 KB。
- 文件包含大量表格、公式、代码块、图片引用。
- 文件必须 100% 原样保留，不能有任何字符差异。
- 用户已经有完整本地文件，不需要 AI 改正文，只需要导出 PDF。

最稳的方式仍然是：用户或脚本把完整文件直接提交到仓库，AI 只负责写 `manifest.yml` 和检查构建结果。

# 2026-07-02 Manifest Queue Actual Test 合集

<!-- source: inbox/2026/07/2026-07-02/md/001-test-overview.md -->

# Manifest 队列实际测试：总览

这是一次真实构建测试，用来验证 `main` 分支合并后能否按 `manifest.yml` 处理 `inbox` 任务。

## 测试目标

- 检查 `single` 任务是否能把多个 Markdown 分别构建为 PDF。
- 检查 `merge` 任务是否能把当天 `md/` 里的全部 Markdown 按文件名顺序合并为一个 PDF。
- 检查构建结果是否会上传 artifact，并发布到 `output` 分支。
- 检查 `consume.delete_after_success: true` 是否会在成功后删除这个 `inbox` 日期目录。

> [!NOTE] 测试说明
> 这份文件是临时测试内容，构建成功后应从 `main` 的 `inbox/2026/07/2026-07-02/` 中消失。

## 表格测试

| 项目 | 预期 |
|---|---|
| single | 生成两个单篇 PDF |
| merge | 生成一个合集 PDF |
| consume | 成功后删除 inbox 日期目录 |

<div class="page-break"></div>

<!-- source: inbox/2026/07/2026-07-02/md/002-test-math-and-image.md -->

# Manifest 队列实际测试：公式与图片

这一页用于测试公式、代码块和相对图片路径。

行内公式示例：\( x^2 + y^2 = r^2 \)。

块级公式示例：

\[
\begin{aligned}
H(Y \mid X) &= \sum_x p(x) H(Y \mid X=x) \\
IG(D, A) &= H(D) - H(D \mid A)
\end{aligned}
\]

## 图片测试

下面这张 SVG 位于当天目录的 `img/` 文件夹中，Markdown 使用 `../img/queue-test.svg` 引用：

![队列测试图](../../../../../inbox/2026/07/2026-07-02/img/queue-test.svg)

## 代码块测试

```js
const jobs = ['single', 'merge'];
console.log(`manifest jobs: ${jobs.join(', ')}`);
```


# Minimal Light Markdown PDF 测试页

这份文档用于测试 Markdown 转 PDF 的各种常见格式。当前主题目标是 **Minimal 浅色风格**：白底、窄正文、克制标题、细线表格、轻量 Callout。

> [!NOTE] 使用方法
> 修改 `notes.md` 后合并到 `main`，GitHub Actions 会自动生成 PDF。生成结果在 Actions 的 Artifacts 里下载。

## 1. 段落、强调、链接、标记

普通段落用于观察正文行距、中文字体、英文混排、标点间距。This sentence checks English and Chinese mixed typography.

这句话包含 **加粗文本**、*斜体文本*、==高亮文本==、`行内代码`，以及一个普通链接：[Obsidian 官网](obsidian.md)。

---

## 2. 列表

### 无序列表

- 第一层项目
- 第一层项目，文字稍微长一点，用于测试换行后的缩进是否正常。
  - 第二层项目
  - 第二层项目
    - 第三层项目

### 有序列表

1. 打开仓库
2. 修改 Markdown
3. 合并到 `main`
4. 下载 PDF artifact

### 任务列表

- [x] 支持中文字体
- [x] 支持 KaTeX 公式
- [x] 支持代码块
- [ ] 支持更多 Obsidian 语法

## 3. 引用与 Callout

普通引用：

> 这是一段普通 blockquote。Minimal 风格下引用不应该太重，只需要轻微区分正文即可。

Obsidian Callout：

> [!NOTE] Note
> 这是一条普通提示，适合放补充说明。

> [!TIP] Tip
> 这是一条技巧提示，适合放记忆方法。

> [!IMPORTANT] Important
> 这是一条重点提示，适合考试核心结论。

> [!WARNING] Warning
> 这是一条警告提示，适合放易错点。

> [!QUESTION] Question
> 这是一条问题提示，适合放自测题。

## 4. 表格

| 类型 | Markdown 写法 | PDF 检查点 |
|---|---|---|
| 标题 | `#`、`##`、`###` | 层级清晰，间距稳定 |
| 公式 | `\(...\)`、`\[...\]` | KaTeX 正常渲染 |
| 代码 | fenced code block | 浅色代码块、字体等宽 |
| Callout | `> [!NOTE]` | 标题、边框、背景正常 |

对齐表格：

| 左对齐 | 居中 | 右对齐 |
|:---|:---:|---:|
| alpha | beta | 123 |
| long text | center text | 456 |

## 5. 代码块

普通代码块：

```text
repo/
├─ notes.md
├─ style.css
├─ themes/
│  └─ obsidian-inspired.css
└─ scripts/
   └─ build-pdf.mjs
```

Markdown 代码块：

```markdown
# 一级标题

> [!NOTE] 提示
> 这里是提示内容。

| A | B |
|---|---|
| 1 | 2 |
```

## 6. 数学公式

行内公式：\( x^2 + y^2 = r^2 \)，以及 \( \alpha + \beta = \gamma \)。

块级公式：

\[
\begin{aligned}
E &= mc^2 \\
f(x) &= \int_0^x e^{-t^2}\,dt \\
\nabla \cdot \mathbf{F} &= \frac{\partial P}{\partial x}+\frac{\partial Q}{\partial y}+\frac{\partial R}{\partial z}
\end{aligned}
\]

矩阵：

\[
A = \begin{bmatrix}
1 & 2 & 3 \\
0 & 1 & 4 \\
5 & 6 & 0
\end{bmatrix}
\]

## 7. 图片与 Obsidian 语法

标准 Markdown 图片写法：

```markdown
![图片说明](images/example.png)
```

Obsidian 双链会被简化成普通文本，例如：`[[机器学习]]`、`[[大数据#Spark|Spark 章节]]`。

## 8. 长段落测试

这是一段较长的中文段落，用来观察 Minimal Light PDF 主题在连续文本中的可读性。理想效果是页面留白足够、正文行宽不要过长、标题不要过于夸张、表格和代码块不要太花。PDF 不是网页截图，而是适合打印和复习阅读的文档，因此整体应该克制、干净、稳定。

## 9. 结尾

如果这一页中的标题、列表、引用、Callout、表格、代码块和公式都正常显示，就说明 Markdown 到 PDF 的主流程基本可用。

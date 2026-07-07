# PDF 渲染基准测试 Markdown

> 用途：以后测试主题、公式、代码高亮、表格、打印背景、分页和常见 Markdown 语法时，统一使用这份文件。

## 1. 基础 Markdown 效果

这是一段普通正文，用来观察段落宽度、行高、中文字体、英文 text rendering、数字 1234567890，以及行内元素：**加粗**、*斜体*、~~删除线~~、`inline code`、[内部链接示例](#3-复杂公式测试)。

- 无序列表一级：观察列表缩进和项目符号。
  - 无序列表二级：观察嵌套缩进。
  - 包含行内公式：$a^2+b^2=c^2$。
- 第二个项目：包含中文、English、数字和标点。

1. 有序列表第一项。
2. 有序列表第二项，包含行内代码 `npm run build:queue`。
3. 有序列表第三项，观察换行和间距。

- [x] 任务列表：已完成。
- [ ] 任务列表：未完成。
- [ ] 任务列表：带较长说明，用来观察 checkbox 和文本换行时的对齐效果。

---

## 2. 引用与 Callout

> 普通引用块：用于观察左侧线条、背景、文字颜色、段落间距。引用中可以包含 `inline code` 和公式 $E=mc^2$。

> [!TIP] Obsidian Callout
> 这是一个 TIP 类型 Callout，用来测试 Obsidian 风格块引用在 PDF 中的背景、边距、圆角和标题渲染。
>
> - 支持列表。
> - 支持行内公式 $\lim_{x\to 0}\frac{\sin x}{x}=1$。

> [!WARNING] 长内容 Callout
> 如果一段 Callout 内容比较长，应该正常换行，不能溢出页面，也不能遮挡后续内容。这里故意写长一些：PDF 渲染要同时兼顾屏幕阅读、A4 打印、代码块、复杂公式和中文字体，因此主题 CSS 不应破坏 KaTeX、Shiki、表格和分页的默认行为。

---

## 3. 复杂公式测试

### 3.1 多行对齐公式

$$
\begin{aligned}
I &= \int_0^1 x^2 e^x\,dx \\
  &= \left(x^2e^x\right)\Big|_0^1 - 2\int_0^1 xe^x\,dx \\
  &= e - 2\left[xe^x\Big|_0^1-\int_0^1 e^x\,dx\right] \\
  &= e - 2\left(e-(e-1)\right) = e-2.
\end{aligned}
$$

### 3.2 分段函数、极限与级数

$$
f(x)=
\begin{cases}
\dfrac{\sin x}{x}, & x\ne 0,\\[6pt]
1, & x=0.
\end{cases}
\qquad
\lim_{n\to\infty}\sum_{k=1}^{n}\frac{1}{n}\left(\frac{k}{n}\right)^2
=\int_0^1 x^2\,dx=\frac13.
$$

### 3.3 矩阵、行列式与向量

$$
A=\begin{pmatrix}
1 & 2 & 3 \\
0 & -1 & 4 \\
5 & 6 & 0
\end{pmatrix},\quad
\det(A)=
\begin{vmatrix}
1 & 2 & 3 \\
0 & -1 & 4 \\
5 & 6 & 0
\end{vmatrix},\quad
\mathbf{x}=\begin{bmatrix}x_1\\x_2\\x_3\end{bmatrix}.
$$

### 3.4 概率统计公式

$$
\bar X=\frac1n\sum_{i=1}^{n}X_i,\qquad
S^2=\frac{1}{n-1}\sum_{i=1}^{n}(X_i-\bar X)^2,
$$

$$
Z=\frac{\bar X-\mu}{\sigma/\sqrt n}\sim N(0,1),\qquad
T=\frac{\bar X-\mu}{S/\sqrt n}\sim t(n-1).
$$

### 3.5 长公式换行

$$
\begin{aligned}
F(x,y,z) &= \frac{\partial}{\partial x}\left(x^2y+e^{xz}\right)
+\frac{\partial}{\partial y}\left(y^2z+\ln(1+x^2)\right)
+\frac{\partial}{\partial z}\left(z^2x+\sin yz\right)\\
&=2xy+ze^{xz}+2yz+xz^2+y\cos yz.
\end{aligned}
$$

---

## 4. 代码块测试

### 4.1 TypeScript

```ts
interface RenderJob {
  id: string;
  theme: 'chatgpt-light' | string;
  inputFiles: string[];
  output: `${string}.pdf`;
}

const job: RenderJob = {
  id: 'pdf-render-test-fixture',
  theme: 'chatgpt-light',
  inputFiles: ['docs/pdf-render-test-fixture.md'],
  output: 'pdf-render-test-fixture.pdf'
};

function describe(job: RenderJob): string {
  return `${job.id}: ${job.inputFiles.length} file(s) -> ${job.output}`;
}

console.log(describe(job));
```

### 4.2 Python

```python
from dataclasses import dataclass
from pathlib import Path

@dataclass
class PdfResult:
    source: Path
    output: Path
    pages: int


def validate(result: PdfResult) -> None:
    assert result.output.suffix == '.pdf'
    assert result.pages >= 1


result = PdfResult(
    source=Path('docs/pdf-render-test-fixture.md'),
    output=Path('dist/pdf-render-test-fixture.pdf'),
    pages=3,
)
validate(result)
```

### 4.3 Bash

```bash
npm install
PDF_THEME=chatgpt-light SHIKI_THEME=github-light npm run build:queue
python /home/oai/skills/pdfs/scripts/render_pdf.py dist/pdf-render-test-fixture.pdf --out_dir /mnt/data/_renders/check --dpi 200
```

### 4.4 JSON

```json
{
  "fixture": "docs/pdf-render-test-fixture.md",
  "theme": "chatgpt-light",
  "highlighter": "shiki",
  "shikiTheme": "github-light",
  "pageBackground": "#ffffff",
  "codeBlockBackground": "#f7f7f8",
  "codeBlockBorder": 0,
  "checks": ["math", "code", "table", "callout", "list"]
}
```

### 4.5 CSS

```css
@page {
  background: #ffffff;
}

.markdown-rendered pre.shiki,
.markdown-rendered pre.shiki-code {
  background: #f7f7f8 !important;
  border: 0 !important;
  border-radius: 7px !important;
}
```

---

## 5. 表格测试

### 5.1 基础表格

| 模块 | 测试内容 | 期望结果 |
|---|---|---|
| Markdown | 标题、列表、引用、任务列表 | 间距自然，缩进正确 |
| Math | 行内公式和块级公式 | KaTeX 字体正常，无错位 |
| Code | TypeScript、Python、Bash、JSON、CSS | Shiki 高亮正常，背景为 `#f7f7f8`，无边框 |
| Table | 普通表格与长文本表格 | 不溢出，不遮挡 |

### 5.2 含公式和代码的表格

| 类型 | 示例 | 说明 |
|---|---:|---|
| 行内公式 | $\int_0^1 x\,dx=\frac12$ | 公式在表格中不能挤压变形 |
| 行内代码 | `const x = 1` | inline code 背景正常 |
| 中文长文本 | 这是一段较长的中文说明，用来测试表格单元格自动换行效果。 | 内容应自动换行 |
| 混合内容 | $S_n=\sum_{k=1}^n k$ 与 `sum(n)` | 公式和代码可同时出现 |

### 5.3 较宽表格

| 序号 | 指标 | 当前设置 | 检查方式 | 失败表现 |
|---:|---|---|---|---|
| 1 | 页面背景 | `#ffffff` | 看页面主体和页边是否同色 | 页边发灰或正文区域发灰 |
| 2 | 代码块背景 | `#f7f7f8` | 看代码块区域 | 背景变成 GitHub 默认白色或过深灰色 |
| 3 | 代码块边框 | `border: 0` | 看代码块四周 | 出现细边框 |
| 4 | 公式渲染 | KaTeX | 看根号、分式、矩阵、积分号 | 字符错位或公式过小 |
| 5 | 表格排版 | 自动换行 | 看长文本单元格 | 溢出页面或遮挡 |

---

## 6. 混合排版压力测试

下面这一段同时包含中文、英文、公式、行内代码和强调：当使用 `chatgpt-light` 主题时，正文背景应该保持纯白，代码块背景保持原来的 `#f7f7f8`，代码块边框为 0；对于公式 $\nabla\cdot\mathbf{F}=\frac{\partial P}{\partial x}+\frac{\partial Q}{\partial y}+\frac{\partial R}{\partial z}$，KaTeX 字体和基线应保持稳定。

最后用一个短公式收尾：

$$
e^{i\pi}+1=0.
$$

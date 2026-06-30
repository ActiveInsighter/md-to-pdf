# Markdown PDF 综合样式测试页

这份文档用于全面测试 Markdown 转 PDF 的显示质量。重点检查：**标题层级是否好看**、正文是否适合打印阅读、表格是否稳定、代码块是否清晰、公式是否正常、Callout 是否有层次、图片是否不溢出。

> [!NOTE] 使用方式
> 修改 `notes.md` 和主题 CSS 后合并到 `main`，GitHub Actions 会自动生成 `dist/notes.pdf` 与 `dist/notes.html`，生成结果在 Actions 的 Artifacts 中下载。

## 1. 标题层级与正文气质

标题不是普通链接，不能出现明显下划线或网页默认字体。一级标题应像文档封面标题，二级标题应像章节标题，三级标题适合放小节，四级以下用于局部说明。

### 1.1 三级标题示例

三级标题应该比正文醒目，但不要像一级标题那样抢眼。下面继续测试四级、五级、六级标题。

#### 1.1.1 四级标题示例

四级标题用于局部知识点，例如“注意事项”“例题分析”“结论”。

##### 五级标题示例

五级标题应克制，适合做补充标签。

###### 六级标题示例

六级标题颜色可以更淡，适合极小层级。

## 2. 段落、强调、链接与行内元素

普通段落用于观察中文正文、英文单词、数字、符号之间的混排效果。This sentence checks English and Chinese mixed typography. PDF 应该像一份可以打印复习的讲义，而不是网页截图。

这句话包含 **加粗文本**、*斜体文本*、==高亮文本==、`inline code`、<kbd>Ctrl</kbd> + <kbd>K</kbd>，以及一个普通链接：[Obsidian 官网](https://obsidian.md)。

长段落测试：一份好的 PDF 样式需要同时兼顾阅读密度和留白。正文行距过大就浪费纸张，行距过小又会拥挤；标题太花会影响复习效率，标题太淡又不方便快速定位。理想效果是：正文稳、标题清、表格细、代码块干净、公式居中且不突兀。

---

## 3. 列表与任务列表

### 3.1 无序列表

- 第一层项目：用于测试普通项目符号。
- 第一层项目文字稍微长一点，用于测试换行后的缩进是否稳定，第二行不应该跑到项目符号下面。
  - 第二层项目：用于测试嵌套缩进。
  - 第二层项目继续加长，观察中文长文本换行。
    - 第三层项目：用于测试更深层级。
    - 第三层项目带 `code` 和 **强调**。

### 3.2 有序列表

1. 打开仓库，确认 `notes.md` 和主题 CSS 的入口。
2. 修改 Markdown 示例，覆盖更多语法。
3. 修改 PDF 主题，重点处理标题字体、代码块、表格与 Callout。
4. 合并到 `main` 后触发 GitHub Actions。
5. 下载 artifact 并渲染检查 PDF 页面。

### 3.3 任务列表

- [x] 中文字体正常
- [x] 标题不再像链接
- [x] 浅色代码块正常
- [x] KaTeX 公式正常
- [ ] 长表格和长代码仍需持续观察

## 4. 引用与 Obsidian Callout

普通引用用于放原文、定义或提示。

> 这是一段普通 blockquote。它应该与正文有轻微区分，但不要过重。引用中的 **重点词** 仍然要清楚，行距也不能过大。

> [!NOTE] Note / 普通提示
> 适合放补充说明、术语解释、背景信息。

> [!TIP] Tip / 记忆技巧
> 适合放口诀、做题技巧、快速记忆方法。

> [!IMPORTANT] Important / 重点结论
> 适合放考试核心结论、必须记住的规则。

> [!WARNING] Warning / 易错提醒
> 适合放容易混淆、容易漏条件、容易算错的地方。

> [!QUESTION] Question / 自测问题
> 适合放自测题或复习前的问题清单。

> [!DANGER] Danger / 严重错误
> 适合放会导致整个结论错误的关键陷阱。

## 5. 表格测试

### 5.1 基础表格

| 类型 | Markdown 写法 | PDF 检查点 |
|---|---|---|
| 标题 | `#`、`##`、`###` | 层级清晰，不能出现链接下划线 |
| 公式 | `\(...\)`、`\[...\]` | KaTeX 正常渲染，行距稳定 |
| 代码 | fenced code block | 浅色代码块、等宽字体、语法高亮 |
| Callout | `> [!NOTE]` | 标题、左边框、背景、正文间距正常 |
| 图片 | `![alt](path)` | 居中显示，不溢出页面 |

### 5.2 对齐表格

| 左对齐 | 居中 | 右对齐 |
|:---|:---:|---:|
| alpha | beta | 123 |
| long text | center text | 456 |
| 中文内容 | 居中显示 | 789 |

### 5.3 混合内容表格

| 场景 | 示例 | 说明 |
|---|---|---|
| 行内代码 | `npm run build:pdf` | 应该能自动换行 |
| 行内公式 | \( O(n \log n) \) | 表格里的公式不能撑破列宽 |
| 长文本 | 这一格故意写得比较长，用于观察表格自动换行后是否仍然美观。 | 单元格不应溢出页面 |
| 链接 | [GitHub](https://github.com) | 链接样式不要太花 |

## 6. 代码块测试

### 6.1 Text / 目录结构

```text
repo/
├─ notes.md
├─ style.css
├─ themes/
│  └─ obsidian-inspired.css
├─ scripts/
│  ├─ build-pdf.mjs
│  └─ build-with-log.mjs
└─ images/
   └─ example.svg
```

### 6.2 Bash

```bash
set -euo pipefail
npm install
npm run build:html
npm run build:pdf
ls -lh dist/notes.pdf dist/notes.html
```

### 6.3 JavaScript

```javascript
function normalizeTitle(title) {
  return String(title)
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

const heading = normalizeTitle('Markdown PDF 综合样式测试页');
console.log({ heading, ok: heading.length > 0 });
```

### 6.4 TypeScript

```typescript
type BuildStatus = 'pending' | 'running' | 'success' | 'failure';

interface BuildRecord {
  runId: string;
  status: BuildStatus;
  artifactName?: string;
}

const record: BuildRecord = {
  runId: '28444227100',
  status: 'success',
  artifactName: 'obsidian-style-pdf'
};
```

### 6.5 Python

```python
from pathlib import Path

root = Path('dist')
for file in root.glob('*'):
    print(file.name, file.stat().st_size)

def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))
```

### 6.6 C++

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a = {1, 1, 2, 3, 5, 8};
    long long sum = 0;
    for (int x : a) sum += x;
    cout << "sum = " << sum << '\n';
    return 0;
}
```

### 6.7 SQL

```sql
SELECT act_id, status, updated_at
FROM workflow_acts
WHERE status IN ('running', 'failed')
ORDER BY updated_at DESC
LIMIT 20;
```

### 6.8 CSS

```css
.markdown-preview-view h2 {
  border-left: 4px solid #2f3437;
  background: linear-gradient(90deg, #f3f5f7, #ffffff);
  border-radius: 9px;
}
```

### 6.9 Markdown 原文

```markdown
> [!TIP] 做题技巧
> 先看条件，再选方法，最后检查边界。

| 名称 | 复杂度 |
|---|---|
| 快速排序 | \( O(n \log n) \) |
```

### 6.10 Diff

```diff
- 使用深色代码块，打印时太重。
+ 使用浅色代码块，打印更清楚。
+ 标题链接不再显示下划线。
```

## 7. 数学公式测试

行内公式：\( x^2 + y^2 = r^2 \)，\( \alpha + \beta = \gamma \)，以及复杂度 \( T(n)=O(n\log n) \)。

块级公式：

\[
\begin{aligned}
E &= mc^2 \\
f(x) &= \int_0^x e^{-t^2}\,dt \\
\nabla \cdot \mathbf{F} &= \frac{\partial P}{\partial x}+\frac{\partial Q}{\partial y}+\frac{\partial R}{\partial z}
\end{aligned}
\]

分段函数：

\[
f(x)=
\begin{cases}
x^2, & x \ge 0, \\
-x, & x < 0.
\end{cases}
\]

矩阵：

\[
A = \begin{bmatrix}
1 & 2 & 3 \\
0 & 1 & 4 \\
5 & 6 & 0
\end{bmatrix},
\quad
\det(A)=1.
\]

长公式换行：

\[
\begin{aligned}
L(\theta)
&= \prod_{i=1}^{n} p(x_i \mid \theta) \\
\ell(\theta)
&= \sum_{i=1}^{n} \log p(x_i \mid \theta) \\
\hat{\theta}
&= \arg\max_{\theta} \ell(\theta)
\end{aligned}
\]

## 8. 图片与 Obsidian 语法

标准 Markdown 图片：

![PDF 样式测试图](images/example.svg)

Obsidian 图片语法也应该被转换：

![[images/example.svg|Obsidian 图片别名]]

Obsidian 双链会被简化为普通文本，例如：`[[机器学习]]`、`[[大数据#Spark|Spark 章节]]`。

## 9. HTML 小组件

键盘按键：<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>。

<details>
<summary>可展开区域示例</summary>

这里用于测试原生 HTML 在 PDF 中的样式。导出 PDF 时通常会显示展开状态或默认状态，至少不能破坏页面布局。

</details>

## 10. 长内容压测

下面是一段较长的正文，用来观察跨页前后的阅读体验。真正的复习资料往往不是单独的组件，而是“标题 + 段落 + 公式 + 表格 + 代码 + Callout”的混合文档。因此样式必须在连续内容中保持稳定：标题不要贴得太近，段落不要太散，表格不要过度占空间，代码块不要变成黑色大块，公式不要与正文脱节。整体目标是：白底、清爽、克制、有层次，适合在电脑上阅读，也适合打印出来复习。

## 11. 最终检查清单

- [ ] 标题字体不奇怪，不像链接。
- [ ] 正文中文字体稳定，英文混排自然。
- [ ] 表格边框清楚，长文本能换行。
- [ ] 代码块覆盖多种语言，浅色高亮正常。
- [ ] 公式、矩阵、分段函数正常渲染。
- [ ] Callout 有区分度，但不过度花哨。
- [ ] 图片不会溢出页面。
- [ ] PDF 页脚页码正常。

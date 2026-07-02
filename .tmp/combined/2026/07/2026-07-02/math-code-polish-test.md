# 2026-07-02 公式与代码高亮优化测试

<!-- source: inbox/2026/07/2026-07-02/md/001-公式与代码高亮优化测试.md -->

# 公式与代码高亮优化测试

> [!NOTE] 本次测试目标
> 重点检查两件事：第一，浅色背景下的代码高亮是否柔和协调；第二，绝对值、范数、上下角标、上下标组合、矩阵、分段函数、极限、求和、积分等公式结构是否稳定美观。

这份文档会故意加入比较多的公式和代码例子。公式使用 KaTeX 原生字体，不再用 CSS 强行替换 `.katex` 的字体栈，这样绝对值竖线、括号伸缩、分式、上下角标和矩阵的垂直对齐会更稳定。

---

## 1. 行内公式压力测试

行内绝对值：\( |x| \)、\( \left|x-1\right| \)、\( \left|\frac{x^2-1}{x-1}\right| \)。

行内范数：\( \lVert \boldsymbol{x} \rVert_2 \)、\( \left\lVert A\boldsymbol{x}-\boldsymbol{b}\right\rVert_2^2 \)。

行内上下角标：\( a_i^2 \)、\( x_{i,j}^{(k+1)} \)、\( \hat{\theta}_n \)、\( \bar{x}_n \)、\( f'(x) \)、\( f''(x_0) \)。

条件概率和集合：\( P(A\mid B)=\frac{P(A\cap B)}{P(B)} \)，以及 \( A_1 \subseteq A_2 \subseteq \cdots \subseteq \Omega \)。

---

## 2. 绝对值、范数和括号伸缩

### 2.1 绝对值

\[
\left|\frac{x^2-1}{x-1}\right| = |x+1|, \qquad x \ne 1
\]

\[
\left|\sum_{i=1}^{n} a_i b_i\right|
\le
\left(\sum_{i=1}^{n} a_i^2\right)^{\frac12}
\left(\sum_{i=1}^{n} b_i^2\right)^{\frac12}
\]

### 2.2 范数

\[
\left\lVert \boldsymbol{x} \right\rVert_2
= \sqrt{x_1^2+x_2^2+\cdots+x_n^2}
\]

\[
\left\lVert A\boldsymbol{x}-\boldsymbol{b}\right\rVert_2^2
= (A\boldsymbol{x}-\boldsymbol{b})^\top(A\boldsymbol{x}-\boldsymbol{b})
\]

### 2.3 括号伸缩

\[
\left(
  \frac{1}{n}\sum_{i=1}^{n} x_i
\right)^2
\le
\frac{1}{n}\sum_{i=1}^{n}x_i^2
\]

\[
\left[\left(1+\frac{1}{n}\right)^n - e\right]
\cdot
\left\{\frac{n}{\log(n+1)}\right\}
\]

---

## 3. 上下角标与复杂标记

\[
X_{n:k}^{(r)} = \max\left\{X_1^{(r)},X_2^{(r)},\ldots,X_k^{(r)}\right\}
\]

\[
\widehat{\sigma}_n^2
= \frac{1}{n}\sum_{i=1}^{n}(X_i-\bar X_n)^2,
\qquad
S_n^2 = \frac{1}{n-1}\sum_{i=1}^{n}(X_i-\bar X_n)^2
\]

\[
\frac{\partial^2 f}{\partial x_i\partial x_j}(\boldsymbol{x}_0)
= H_{ij}(\boldsymbol{x}_0)
\]

\[
\nabla_{\boldsymbol{w}} J(\boldsymbol{w},b)
= \frac{1}{m}\sum_{i=1}^{m}\left(\hat y^{(i)}-y^{(i)}\right)\boldsymbol{x}^{(i)}
\]

---

## 4. 分段函数、极限、求和与积分

### 4.1 分段函数

\[
f(x)=
\begin{cases}
 x^2, & x < 0, \\
 0, & x = 0, \\
 \sqrt{x}, & x > 0.
\end{cases}
\]

### 4.2 极限

\[
\lim_{n\to\infty}\left(1+\frac{x}{n}\right)^n=e^x
\]

\[
\lim_{x\to 0}\frac{\sin x - x + \frac{x^3}{6}}{x^5}
= \frac{1}{120}
\]

### 4.3 求和

\[
\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}
\]

\[
\sum_{i=1}^{m}\sum_{j=1}^{n} a_i b_j
=\left(\sum_{i=1}^{m}a_i\right)\left(\sum_{j=1}^{n}b_j\right)
\]

### 4.4 积分

\[
\int_{0}^{1}x^\alpha(1-x)^\beta\,dx
= \frac{\Gamma(\alpha+1)\Gamma(\beta+1)}{\Gamma(\alpha+\beta+2)}
\]

\[
\iint_D (x^2+y^2)\,dx\,dy
= \int_0^{2\pi}\int_0^R r^2\cdot r\,dr\,d\theta
= \frac{\pi R^4}{2}
\]

---

## 5. 矩阵、行列式和多行推导

### 5.1 矩阵

\[
A =
\begin{bmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{bmatrix},
\qquad
\boldsymbol{x}=
\begin{bmatrix}
x_1 \\
x_2 \\
x_3
\end{bmatrix}
\]

### 5.2 行列式

\[
\det(A-\lambda I)=
\begin{vmatrix}
a_{11}-\lambda & a_{12} & a_{13} \\
a_{21} & a_{22}-\lambda & a_{23} \\
a_{31} & a_{32} & a_{33}-\lambda
\end{vmatrix}
\]

### 5.3 多行推导

\[
\begin{aligned}
J(\theta)
&= \frac{1}{2m}\sum_{i=1}^{m}\left(h_\theta(x^{(i)})-y^{(i)}\right)^2 \\
\frac{\partial J}{\partial \theta_j}
&= \frac{1}{m}\sum_{i=1}^{m}\left(h_\theta(x^{(i)})-y^{(i)}\right)x_j^{(i)} \\
\theta_j
&:= \theta_j - \alpha\frac{\partial J}{\partial \theta_j}
\end{aligned}
\]

---

## 6. 表格中的公式测试

| 场景 | 公式 | 检查点 |
|---|---|---|
| 绝对值 | \( \left|x_i-y_i\right| \) | 竖线高度是否正常 |
| 范数 | \( \left\lVert \boldsymbol{x}\right\rVert_2 \) | 双竖线是否协调 |
| 上下标 | \( x_{i,j}^{(k+1)} \) | 角标是否挤压行高 |
| 条件概率 | \( P(A\mid B)=\frac{P(AB)}{P(B)} \) | 分式是否过高或错位 |
| 梯度 | \( \nabla_{\theta_j}J(\theta) \) | 下标位置是否稳定 |

---

## 7. 代码高亮测试

### 7.1 JavaScript

```javascript
const palette = {
  keyword: '#6f4fc9',
  string: '#2f7d5c',
  function: '#256fa8',
  property: '#8b6b2f',
  comment: '#8c94a1',
};

function renderFormula(tex, displayMode = false) {
  if (typeof tex !== 'string' || tex.trim() === '') {
    throw new Error('Formula must be a non-empty string');
  }

  return {
    html: katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
    }),
    displayMode,
  };
}

console.log(renderFormula('\\left|x-1\\right|', true));
```

### 7.2 Python

```python
from dataclasses import dataclass
from pathlib import Path

@dataclass
class Theme:
    name: str
    code_background: str = '#f7f7f8'
    math_engine: str = 'katex-native-fonts'


def list_theme_files(root: Path) -> list[str]:
    return sorted(file.name for file in root.glob('*.css'))


theme = Theme(name='clean')
print(theme)
print(list_theme_files(Path('themes')))
```

### 7.3 CSS

```css
:root {
  --ky-bg-code: #f7f7f8;
  --code-keyword: #6f4fc9;
  --code-string: #2f7d5c;
  --code-function: #256fa8;
  --code-comment: #8c94a1;
}

.markdown-rendered .katex {
  color: var(--math-color);
  text-rendering: geometricPrecision;
}
```

### 7.4 SQL

```sql
SELECT theme, output_path, status, finished_at
FROM pdf_build_runs
WHERE theme = 'clean'
  AND status IN ('success', 'warning')
ORDER BY finished_at DESC
LIMIT 10;
```

### 7.5 HTML

```html
<article class="markdown-rendered">
  <h2>Formula preview</h2>
  <p>Inline math: <span class="katex">|x|</span></p>
</article>
```

---

## 8. 预期结果

> [!SUCCESS] 预期
> 代码块应该更像“柔和的工程文档配色”：背景仍是浅灰，颜色不刺眼，但关键字、字符串、函数、属性、数字能明显区分。公式应该保持 KaTeX 原生字体，绝对值、范数、上下角标和矩阵的对齐应比之前更稳定。


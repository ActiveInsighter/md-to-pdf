# KaTeX 数学公式保护层回归测试

这份文档用于检查 `style.css` 中新增的 KaTeX 保护层，重点测试行内公式、块级公式、上下标、求和、分式、矩阵、对齐公式和表格中的公式。

## 1. 行内公式

这是一段包含行内公式的中文文本：样本均值记为 \( \bar X = \frac{1}{n}\sum_{i=1}^{n}X_i \)，当样本独立同分布时有 \( E(\bar X)=\mu \)，并且 \( D(\bar X)=\sigma^2/n \)。这一行用于观察行内公式是否把整行撑得过高、是否出现上下标错位、求和符号是否异常偏移。

再测试几个行内结构：\( a_i^2+b_i^2=c_i^2 \)、\( \lim_{x\to 0}\frac{\sin x}{x}=1 \)、\( \int_0^1 x^2\,dx=\frac13 \)、\( P(A\mid B)=\frac{P(AB)}{P(B)} \)。

## 2. 块级公式

\[
\begin{aligned}
D(\bar X) &= D\left(\frac{1}{n}\sum_{i=1}^{n}X_i\right) \\
&= \frac{1}{n^2}\sum_{i=1}^{n}D(X_i) \\
&= \frac{\sigma^2}{n}.
\end{aligned}
\]

## 3. 矩阵与多行公式

\[
A=\begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix},\qquad
\det(A-\lambda I)=0.
\]

\[
\begin{aligned}
\int_0^1\int_0^{1-x} (x+y)\,dy\,dx
&= \int_0^1 \left[xy+\frac{y^2}{2}\right]_{0}^{1-x} dx \\
&= \int_0^1 \left(x(1-x)+\frac{(1-x)^2}{2}\right) dx \\
&= \frac{1}{3}.
\end{aligned}
\]

## 4. 表格中的公式

| 名称 | 公式 | 说明 |
|---|---|---|
| 样本均值 | \( \bar X = \frac{1}{n}\sum_{i=1}^{n}X_i \) | 行内求和和分式 |
| 方差 | \( D(X)=E(X^2)-[E(X)]^2 \) | 普通行内公式 |
| 极限 | \( \lim_{n\to\infty}(1+\frac{1}{n})^n=e \) | 上下标和分式 |

## 5. 结论检查项

- 行内公式不应把段落行高异常撑大。
- 块级公式上下间距应稳定。
- 表格中的公式不应被强制断行。
- 手机 PDF 预览器中上下标、分式线和求和号应尽量保持稳定。

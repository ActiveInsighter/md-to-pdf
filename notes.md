# 无穷级数和数列和式极限为什么能写成定积分

## 0. 一句话先说透

有些无穷级数和数列和式极限能写成定积分，本质原因是：**它们长得像“很多个小矩形面积之和”**。当小矩形越来越窄、越来越多时，面积和就趋近于曲线下面的面积，也就是定积分。

最典型的形式是：

\[
\lim_{n\to\infty}\frac{1}{n}\sum_{k=1}^{n} f\left(\frac{k}{n}\right)=\int_0^1 f(x)\,dx
\]

这里：

- \(\frac{1}{n}\) 是每个小区间的宽度；
- \(\frac{k}{n}\) 是第 \(k\) 个取样点；
- \(f\left(\frac{k}{n}\right)\) 是小矩形的高度；
- \(\frac{1}{n}f\left(\frac{k}{n}\right)\) 是小矩形面积；
- \(\sum\) 是把所有小矩形面积加起来；
- \(n\to\infty\) 时，小矩形无限变细，面积和就变成定积分。

> [!IMPORTANT] 核心直觉
> 定积分不是凭空冒出来的，它本来就是“极限形式的和”。所以很多和式极限能转成定积分，不是硬套公式，而是把和式看成小矩形面积和。

---

## 1. 定积分本来就是“极限形式的和”

定积分的定义本身就是一种极限和：

\[
\int_a^b f(x)\,dx=\lim_{n\to\infty}\sum_{k=1}^{n} f(\xi_k)\Delta x
\]

如果把区间 \([a,b]\) 平均分成 \(n\) 份，那么：

\[
\Delta x=\frac{b-a}{n}
\]

第 \(k\) 个右端点可以写成：

\[
x_k=a+k\Delta x=a+\frac{k(b-a)}{n}
\]

所以常见的右端点积分和是：

\[
\int_a^b f(x)\,dx=\lim_{n\to\infty}\sum_{k=1}^{n} f\left(a+\frac{k(b-a)}{n}\right)\frac{b-a}{n}
\]

因此，只要一个数列和式极限能整理成：

\[
\sum_{k=1}^{n} f\left(a+\frac{k(b-a)}{n}\right)\frac{b-a}{n}
\]

它就可以写成：

\[
\int_a^b f(x)\,dx
\]

---

## 2. 为什么经常出现 \(\frac{k}{n}\)

因为 \(\frac{k}{n}\) 正好把 \(k=1,2,\cdots,n\) 映射到区间 \([0,1]\) 上的一串分点：

\[
\frac{1}{n},\frac{2}{n},\cdots,\frac{n}{n}
\]

也就是：

\[
x_k=\frac{k}{n}
\]

相邻两点之间的间隔是：

\[
\Delta x=\frac{1}{n}
\]

所以：

\[
\frac{1}{n}\sum_{k=1}^{n} f\left(\frac{k}{n}\right)
\]

就是区间 \([0,1]\) 上的积分和，对应：

\[
\int_0^1 f(x)\,dx
\]

---

## 3. 最简单例子

求：

\[
\lim_{n\to\infty}\frac{1}{n}\sum_{k=1}^{n}\left(\frac{k}{n}\right)^2
\]

它符合标准形式：

\[
\frac{1}{n}\sum_{k=1}^{n} f\left(\frac{k}{n}\right)
\]

其中：

\[
f(x)=x^2
\]

所以：

\[
\lim_{n\to\infty}\frac{1}{n}\sum_{k=1}^{n}\left(\frac{k}{n}\right)^2=\int_0^1 x^2\,dx=\frac{1}{3}
\]

这就是把 \(y=x^2\) 在 \([0,1]\) 下方的面积用很多小矩形逼近。

---

## 4. “有的无穷级数”为什么也能用定积分

严格来说，普通无穷级数：

\[
\sum_{k=1}^{\infty}a_k
\]

不一定能直接写成定积分。能转成定积分的，通常是某种“和式极限”：

\[
\lim_{n\to\infty}\sum_{k=1}^{n} A_{n,k}
\]

其中每一项 \(A_{n,k}\) 里既有 \(k\)，又有 \(n\)，并且能整理出“宽度因子” \(\frac{1}{n}\)。

例如：

\[
\lim_{n\to\infty}\sum_{k=1}^{n}\frac{1}{n+k}
\]

它看起来不像积分，但可以变形：

\[
\frac{1}{n+k}=\frac{1}{n}\cdot\frac{1}{1+\frac{k}{n}}
\]

所以：

\[
\sum_{k=1}^{n}\frac{1}{n+k}=\frac{1}{n}\sum_{k=1}^{n}\frac{1}{1+\frac{k}{n}}
\]

这就是标准积分和，其中：

\[
f(x)=\frac{1}{1+x}
\]

因此：

\[
\lim_{n\to\infty}\sum_{k=1}^{n}\frac{1}{n+k}=\int_0^1\frac{1}{1+x}\,dx=\ln 2
\]

---

## 5. 判断能不能转定积分的核心套路

### 第一步：找 \(\frac{k}{n}\)

如果和式中出现：

\[
\frac{k}{n},\quad 1+\frac{k}{n},\quad a+\frac{k}{n}(b-a)
\]

就要马上想到定积分。

### 第二步：找 \(\frac{1}{n}\)

定积分和的标准结构一定有一个“小宽度”：

\[
\Delta x
\]

在 \([0,1]\) 上通常就是：

\[
\Delta x=\frac{1}{n}
\]

所以看到：

\[
\frac{1}{n}\sum_{k=1}^{n}f\left(\frac{k}{n}\right)
\]

基本可以直接写成：

\[
\int_0^1 f(x)\,dx
\]

### 第三步：没有 \(\frac{1}{n}\) 就尝试凑

很多题不会直接给你 \(\frac{1}{n}\)，而是藏在分母里。

例如：

\[
\lim_{n\to\infty}\sum_{k=1}^{n}\frac{n}{n^2+k^2}
\]

变形：

\[
\frac{n}{n^2+k^2}=\frac{1}{n}\cdot\frac{1}{1+\left(\frac{k}{n}\right)^2}
\]

所以：

\[
\lim_{n\to\infty}\sum_{k=1}^{n}\frac{n}{n^2+k^2}=\int_0^1\frac{1}{1+x^2}\,dx=\frac{\pi}{4}
\]

但如果题目是：

\[
\lim_{n\to\infty}\sum_{k=1}^{n}\frac{1}{n^2+k^2}
\]

则有：

\[
\frac{1}{n^2+k^2}=\frac{1}{n^2}\cdot\frac{1}{1+\left(\frac{k}{n}\right)^2}
\]

整体量级大约是 \(n\cdot\frac{1}{n^2}=\frac{1}{n}\)，所以极限是 \(0\)，不能直接当成 \(\frac{\pi}{4}\)。

> [!WARNING] 最容易错的地方
> 不是看到 \(\frac{k}{n}\) 就一定能积分。还必须有对应的“小宽度” \(\Delta x\)。少了宽度，和式可能会趋向无穷大；宽度太小，和式可能趋向 \(0\)。

---

## 6. 更一般的区间 \([a,b]\)

如果出现：

\[
a+\frac{k}{n}(b-a)
\]

那么取样点在区间 \([a,b]\) 上。标准形式是：

\[
\lim_{n\to\infty}\frac{b-a}{n}\sum_{k=1}^{n}f\left(a+\frac{k(b-a)}{n}\right)=\int_a^b f(x)\,dx
\]

例如：

\[
\lim_{n\to\infty}\frac{2}{n}\sum_{k=1}^{n}\sqrt{1+\left(\frac{2k}{n}\right)^2}
\]

这里：

\[
\Delta x=\frac{2}{n},\qquad x_k=\frac{2k}{n}
\]

所以区间是 \([0,2]\)，函数是：

\[
f(x)=\sqrt{1+x^2}
\]

因此：

\[
\lim_{n\to\infty}\frac{2}{n}\sum_{k=1}^{n}\sqrt{1+\left(\frac{2k}{n}\right)^2}=\int_0^2\sqrt{1+x^2}\,dx
\]

---

## 7. 常见模板

### 模板一：最标准型

\[
\lim_{n\to\infty}\frac{1}{n}\sum_{k=1}^{n}f\left(\frac{k}{n}\right)=\int_0^1 f(x)\,dx
\]

### 模板二：分母藏着 \(n\)

\[
\frac{1}{n+k}=\frac{1}{n}\cdot\frac{1}{1+\frac{k}{n}}
\]

这种题的核心就是把通项改写成：

\[
\frac{1}{n}f\left(\frac{k}{n}\right)
\]

### 模板三：区间不是 \([0,1]\)

\[
\lim_{n\to\infty}\frac{b-a}{n}\sum_{k=1}^{n}f\left(a+\frac{k(b-a)}{n}\right)=\int_a^b f(x)\,dx
\]

### 模板四：乘积极限先取对数

有些乘积极限可以先转成和式，再转成积分。

例如：

\[
P_n=\prod_{k=1}^{n}\left(1+\frac{k}{n^2}\right)
\]

取对数：

\[
\ln P_n=\sum_{k=1}^{n}\ln\left(1+\frac{k}{n^2}\right)
\]

因为 \(\ln(1+t)\sim t\)，所以：

\[
\ln\left(1+\frac{k}{n^2}\right)\sim\frac{k}{n^2}=\frac{1}{n}\cdot\frac{k}{n}
\]

于是：

\[
\ln P_n\to\int_0^1 x\,dx=\frac{1}{2}
\]

所以：

\[
P_n\to e^{\frac{1}{2}}
\]

---

## 8. 什么时候不能乱用定积分

### 情况一：少了“小宽度”

比如：

\[
\sum_{k=1}^{n}\left(\frac{k}{n}\right)^2
\]

它少了 \(\frac{1}{n}\)，所以不是面积和。事实上：

\[
\sum_{k=1}^{n}\left(\frac{k}{n}\right)^2\approx n\int_0^1 x^2\,dx
\]

它趋向无穷大，而不是 \(\frac{1}{3}\)。

### 情况二：取样点不是某个区间上的密集分点

定积分要求取样点随着 \(n\to\infty\) 在某个区间内越来越密。如果 \(k\) 和 \(n\) 的关系不能整理成类似 \(\frac{k}{n}\) 的形式，一般不能直接转积分。

### 情况三：函数有不可积奇点

例如：

\[
\frac{1}{n}\sum_{k=1}^{n}\frac{1}{\frac{k}{n}}
\]

形式上像：

\[
\int_0^1\frac{1}{x}\,dx
\]

但这个积分在 \(0\) 处发散，所以不能得到有限值。

---

## 9. 做题口诀

**看到 \(\sum\)，先找 \(\frac{1}{n}\)；看到 \(k\)，先凑 \(\frac{k}{n}\)；宽度是 \(\Delta x\)，高度是函数值，区间看取样点从哪到哪。**

具体步骤：

1. 把通项改写成：

   \[
   \Delta x\cdot f(x_k)
   \]

2. 找出取样点：

   \[
   x_k=a+k\Delta x
   \]

3. 根据 \(x_k\) 的范围确定积分上下限。
4. 把 \(\sum\) 改成 \(\int\)。
5. 计算定积分。

---

## 10. 最后总结

数列和式极限能转成定积分，不是因为“套公式”，而是因为：

\[
\text{定积分}=\text{无限多个小矩形面积的极限和}
\]

所以当题目中的和式能整理成：

\[
\sum f(x_k)\Delta x
\]

并且取样点 \(x_k\) 在某个区间 \([a,b]\) 上越来越密时，就可以写成：

\[
\int_a^b f(x)\,dx
\]

考试中最关键的是识别：

\[
\frac{1}{n},\qquad \frac{k}{n},\qquad a+\frac{k(b-a)}{n}
\]

它们分别代表：

- \(\frac{1}{n}\)：小区间宽度；
- \(\frac{k}{n}\)：取样点；
- \(a+\frac{k(b-a)}{n}\)：区间 \([a,b]\) 上的取样点。

只要你能把和式拆成“宽度乘高度”的形式，这类题就会变得很清楚。

# Obsidian 风格 PDF 示例

这是一份示例 Markdown。你可以把这里替换成自己的复习资料、题目解析或课堂笔记。

> [!NOTE] 使用方法
> 提交 Markdown 后，GitHub Actions 会自动生成 PDF。生成结果在 Actions 的 Artifacts 里下载。

## 基础排版

普通段落会按照类似 Obsidian 阅读模式的风格渲染。标题、列表、表格、引用、代码块都会被 CSS 美化。

### 列表

- 支持普通列表
- 支持任务列表
- 支持中文内容
- 支持 Obsidian-inspired 主题样式

- [x] 写 Markdown
- [x] 自动转 HTML
- [x] 自动打印 PDF

### 表格

| 模块 | 作用 | 备注 |
|---|---|---|
| Markdown | 写笔记 | 适合 Obsidian |
| CSS | 控制样式 | 适合做网页风格 PDF |
| Chromium | 打印 PDF | 支持背景色、页边距、页码 |

## 数学公式

行内公式示例：\( x^2 + y^2 = r^2 \)。

块级公式示例：

\[
\begin{aligned}
E &= mc^2 \\
a^2 + b^2 &= c^2
\end{aligned}
\]

## 代码块

```js
function hello(name) {
  return `Hello, ${name}!`;
}

console.log(hello('Obsidian PDF'));
```

## Callout 示例

> [!IMPORTANT] 重点
> 浏览器打印路线的优点是可以用 CSS 控制 PDF 样式，适合做浅灰背景、代码块、卡片、标题美化等效果。

> [!WARNING] 注意
> 如果你使用 Obsidian 的双链和嵌入图片语法，本模板会做基础转换，但复杂嵌入仍建议改成标准 Markdown 图片语法。

## 图片引用

把图片放到 `images/` 文件夹，然后这样引用：

```markdown
![图片说明](images/example.png)
```

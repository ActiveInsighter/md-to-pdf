# AI 构建交付规则

每次触发 GitHub Actions 构建 PDF 后，AI 必须继续跟进构建结果，不能只说已经触发构建。

必须完成以下动作：

1. 查看对应 workflow run 是否成功。
2. 如果构建失败，读取日志并说明失败原因，必要时修复后重新触发构建。
3. 如果构建成功，下载 GitHub Actions artifact 或从 `output` 分支取得最新 PDF。
4. 将最终 PDF 文件直接发给用户。

一句话规则：

```text
每次触发构建后，都要把生成的 PDF 发给用户。
```

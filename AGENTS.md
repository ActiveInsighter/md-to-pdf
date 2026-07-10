# AGENTS.md

本文件适用于整个仓库，是 AI、自动化代理和代码代理处理 PDF 导出任务时的最高优先级操作说明。

## 1. 先判断任务类型

### A. 纯 PDF 导出任务

同时满足以下条件时走快速路径：

- 只新增一个临时 `inbox/**` 任务；
- 不修改 `scripts/**`、`themes/**`、`style.css`、工作流、依赖或项目文档；
- 用户只要求生成、合并或导出 Markdown PDF。

纯导出任务允许把一次性队列提交直接原子写入 `main`，无需创建临时分支和 PR。

### B. 项目修改任务

只要涉及下面任意内容，就必须走分支与 PR：

- 渲染脚本、主题、样式或依赖；
- GitHub Actions 工作流；
- 队列格式、校验逻辑、发布逻辑；
- README、`docs/**`、测试样例；
- 同一次提交既包含 `inbox/**`，又包含项目源码或文档修改。

## 2. 纯导出任务的快速路径

按顺序执行，不要额外扫描整个仓库：

1. 读取本文件；常规导出不要重复阅读完整 README、渲染脚本和历史 PR。
2. 在内存中一次性完成 Markdown、`manifest.yml` 和图片等全部内容。
3. 默认主题使用 `chatgpt-light`，除非用户明确指定其他主题。
4. 目标目录使用 `inbox/YYYY/MM/YYYY-MM-DD/`，文件名必须兼容 Windows。
5. 提交前只做必要检查：日期一致、输入文件存在、图片路径正确、公式分隔符正确、输出名以 `.pdf` 结尾。
6. 检查目标日期目录是否已有未消费的 `manifest.yml`、`manifest.yaml` 或 `manifest.json`。若存在，先根据 `.github/latest-run.json` 判断是否有构建正在运行，禁止覆盖现有任务。
7. 把本次所有文件作为一个 Git 提交写入：`create_blob × N -> create_tree -> create_commit -> update_ref(force=false)`。
8. 禁止对同一导出任务连续调用多次 `create_file`，禁止先提交占位文件再补内容。
9. 记录提交到 `main` 的导出提交 SHA，后续状态必须与该 SHA 对应。
10. 若 `main` 在更新前发生移动，重新读取最新 `main` 后只重建一次提交；若仍被拒绝或分支受保护，回退到 `export/*` 分支与 PR。

建议提交信息：

```text
export: <文档标题>
```

## 3. 高效等待构建

导出提交进入 `main` 后：

1. 只轮询 `.github/latest-run.json`，不要通过搜索提交记录猜测状态。
2. 仅当其中的 `head_sha` 等于本次导出提交 SHA 时，才把记录视为本次任务。
3. 终态包括：`success`、`failure`、`artifact_failed`、`publish_failed`、`consume_failed`、`skipped`。
4. 建议每隔 5 至 10 秒检查一次，不要高频重复请求。
5. 状态未完成时，不读取完整日志、不搜索 Artifact、不读取 `output` 分支。

成功后按下面顺序读取：

```text
.github/latest-run.json
-> .github/latest-output.json
-> 对应 run_id 的 obsidian-style-pdf Artifact
-> 下载一次 ZIP
-> 按 latest-output.json 解出目标文件
```

失败后才读取：

```text
.github/latest-build-log.txt
.github/last-build-summary.json
```

只排查日志指出的文件或阶段，不重新扫描整个项目。

## 4. 验收规则

成功交付前至少满足：

- `.github/latest-run.json` 的状态为 `success`；
- `build_outcome`、`artifact_outcome`、`publish_outcome`、`consume_outcome` 均成功；
- `.github/latest-output.json` 能定位 PDF、HTML、预览图和质量报告；
- 质量状态为 `success`，或仅包含已经说明的非致命 `warning`；
- PDF 文件头、页数、图片加载和 KaTeX 检查通过；
- 只查看自动生成的一张合成预览图，不重复渲染全部页面。

不要在构建完成前声称 PDF 已生成。

## 5. 交付规则

默认只向用户提供：

1. PDF；
2. Markdown 源文件；
3. 合成预览图，可选。

除非用户明确要求，否则不要把完整 Artifact ZIP 作为主要下载项。最终回复应说明页数、主题和质量状态，但不要堆叠内部 SHA、run id 或冗长日志。

## 6. Markdown 生成约束

- 一级标题只作为文档标题，正文从二级标题组织。
- 数学公式统一使用 `\(...\)` 和 `\[...\]`。
- 多行公式使用 `aligned`。
- 代码块必须标明语言；未知语言使用 `text`。
- 表格控制列数和单元格长度，长推导放在表格外。
- 图片优先使用本地 PNG 或 SVG，并从 `md/` 目录以 `../img/...` 引用。
- 不依赖远程图片、远程 CSS、iframe 或脚本。
- Mermaid、PlantUML、Excalidraw 等内容先转换为 PNG 或 SVG。
- 不为了测试而人为塞入用户未要求的复杂结构。

## 7. 失败回退

只允许针对明确错误修复：

- Markdown 或图片问题：修复同一任务并重新提交一个完整原子提交；
- manifest 问题：只修改 manifest 与受影响输入；
- 渲染器或主题问题：切换到 `fix/*` 或 `style/*` 分支，提交 PR，并运行渲染回归测试；
- GitHub API 或分支保护拒绝直接更新 `main`：使用 `export/*` 分支与 PR，不强制更新引用。

每次失败最多先做一次针对性重试；仍失败时应明确报告错误位置和日志结论。

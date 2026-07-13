# AGENTS.md

本文件适用于整个仓库，是 AI、自动化代理和代码代理修改 md-to-pdf 项目时的最高优先级操作说明。

## 1. 架构边界

线上 PDF 任务只有一条入口：

```text
前端网站
→ Supabase Edge Functions
→ GitHub Actions build-pdf-api.yml
→ Supabase 私有 Storage
```

必须遵守：

- 不得通过提交 Markdown、ZIP、图片或 manifest 到 Git 仓库来触发 PDF 构建；
- 不得重新引入 `inbox/**` 队列、manifest 队列解析或 `output` 分支发布逻辑；
- 用户输入文件不得写入仓库、commit、PR 或长期 Artifact；
- GitHub Actions 只能根据网站创建的任务 ID 获取私有输入并回写任务状态；
- Cloudflare Pages 只托管前端，不处理 PDF 文件。

## 2. 项目修改流程

涉及源码、主题、样式、工作流、依赖、数据库、Edge Functions、README 或 `docs/**` 时：

```text
agent/*、feature/*、fix/*、style/*、docs/* 或 test/* 分支
→ 有边界的提交
→ PR
→ 对应验证
→ 合并 main
```

禁止为了测试线上构建而把用户文档提交到仓库。需要验证渲染器时，使用 `fixtures/` 中的受控测试内容或在 `.tmp/` 中生成临时文件。

## 3. 网站任务生命周期

标准状态流转为：

```text
created
→ uploaded
→ queued
→ building
→ uploading
→ completed
```

前端允许先在 `created` 阶段上传私有 Markdown 与可选 ZIP；只有用户明确点击“生成 PDF”后才能调用 `start-pdf-job` 并进入构建队列。失败进入 `failed`，尚未启动且允许取消的任务可以进入 `cancelled`。

修改任务流程时必须保证：

- 状态推进单向且可重试；
- 同一任务不会重复触发并行构建；
- 用户只能访问自己的任务；
- 输入上传完成后才能触发工作流；
- 构建成功后再删除输入对象；
- 失败时保留足够的诊断信息，但不得泄露密钥或用户文件内容；
- 前端以 Realtime 为主、轮询为兜底；
- 自动下载失败不能改变服务端已完成状态。

## 4. GitHub Actions 规则

网站构建工作流是：

```text
.github/workflows/build-pdf-api.yml
```

修改时必须保持：

- 仅使用 `workflow_dispatch` 和必填的 `job_id`；
- `permissions.contents` 保持只读；
- checkout 不持久化 Git 凭据；
- 不向仓库提交运行状态、日志或生成产物；
- 不把输入 Markdown、资源 ZIP 或 PDF 长期保存在 Artifact；
- Debug Artifact 只能短期保留，并且不能包含服务端密钥；
- 每一步失败都能把任务标记为 `failed`；
- 输入与 ZIP 安全限制不得放宽。

前端部署工作流与 PDF 构建工作流相互独立。只有前端、Pages 工作流或 UI 截图脚本推送到 `main` 时才自动部署 Pages；后端、文档或渲染器改动不应无条件触发前端部署。Pages 同时保留手动 `workflow_dispatch` 以便重试。

## 5. 渲染器开发规则

核心渲染器：

```text
scripts/build-pdf.mjs
scripts/lib/render-preflight.mjs
scripts/postprocess-pdfs.mjs
```

默认主题为 `chatgpt-light`，除非产品逻辑明确选择其他已存在主题。

渲染器修改至少执行：

```bash
npm ci --prefer-offline --no-audit --no-fund
npm test
npm run validate:workflows
npm run test:workflows
```

测试输出必须进入 `dist/` 或 `.tmp/`，不得提交生成的 PDF、HTML、预览图、质量报告或运行日志。

## 6. 前端与 Edge Functions 规则

前端只能使用：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

任何服务端密钥都不得使用 `VITE_*` 前缀。

涉及前端时至少执行：

```bash
cd frontend
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

涉及 Edge Functions 时至少执行对应的 Deno 检查和共享测试。CORS、鉴权、RLS、Storage 路径、任务所有权与签名下载逻辑属于安全边界，不能通过前端校验代替服务端校验。

## 7. Markdown 与资源约束

- 数学公式统一支持 `\(...\)` 和 `\[...\]`；
- 多行公式使用 `aligned`；
- 代码块应标明语言，未知语言使用 `text`；
- 图片使用相对路径并随资源 ZIP 上传；
- 不依赖远程 CSS、iframe 或远程脚本；
- Mermaid、PlantUML、Excalidraw 等内容应先转换为 PNG 或 SVG；
- ZIP 内路径必须兼容 Windows；
- 禁止绝对路径、Windows 盘符、`..`、符号链接和 Zip Slip。

## 8. 验收与交付

完成修改前需要确认：

- 网站创建任务的入口仍可用；
- 选择文件或粘贴文本只上传私有输入，不会自动触发构建；
- `start-pdf-job` 仍只触发 `build-pdf-api.yml`；
- 工作流仍能下载输入、生成 PDF、上传输出并更新状态；
- 前端仍能显示真实进度和生命周期时间；
- 下载使用短期签名 URL；
- 仓库内不存在通过 Git 文件提交触发 PDF 构建的入口；
- 文档、脚本和工作流不存在已删除队列的残留引用。

不要在验证完成前声称功能可用，也不要把内部 token、service role key、用户文件内容或签名 URL 写入日志、issue、PR 描述或最终回复。

## 9. Temporary branch hygiene

Pull Request 合并后，应删除已经合并且不再使用的临时分支。自动清理必须同时满足：

- 分支来自当前仓库；
- 对应 Pull Request 已合并；
- 分支名称符合允许的临时前缀；
- `main`、`master`、`output`、`gh-pages` 等受保护分支永不删除；
- 清理过程保留可审计日志，并支持 dry-run 验证。

# md-to-pdf

将 Markdown 渲染为接近 Obsidian 阅读模式的 HTML 与 A4 PDF，并通过前端网站提供异步构建、进度跟踪与下载。

```text
Markdown → Markdown-it → KaTeX / Shiki → HTML + CSS → Chromium → PDF
```

默认主题为 `chatgpt-light`。

## 核心能力

- Markdown-it 解析与 Markdown 软换行；
- KaTeX 行内公式和块级公式；
- Shiki 代码高亮；
- 表格、图片、Callout 和少量原生 HTML；
- Chromium / Puppeteer PDF 渲染；
- 私有 Supabase Storage 异步任务；
- Realtime 状态更新与轮询兜底；
- 构建完成后的通知和可选自动下载；
- Windows 兼容文件名与压缩包路径校验。

## 架构概览

```text
Cloudflare Pages
    ↓
React 前端
    ↓
Supabase Auth / PostgreSQL / Storage / Realtime / Edge Functions
    ↓
GitHub Actions workflow_dispatch
    ↓
Markdown → HTML → Chromium → PDF
    ↓
Supabase 私有 Storage
```

Cloudflare 只负责 Pages 前端托管。生产前端由 GitHub Actions Direct Upload 部署，不使用 Cloudflare Git Integration。

## 唯一生产构建路径

```text
用户登录网站
→ 选择 Markdown 和可选资源 ZIP
→ Edge Function 创建任务并上传私有输入文件
→ start-pdf-job 触发 build-pdf-api.yml
→ Actions 下载并安全校验输入
→ Actions 生成并校验 PDF
→ PDF 上传到私有 Storage
→ Realtime 更新状态，前端轮询兜底
→ 用户获取短期签名下载地址
```

用户文件不会提交到 Git 仓库，也不会为每次转换创建 commit。仓库中的普通文件提交只用于代码、配置、主题和文档维护，不会直接触发 PDF 任务构建。

## 本地渲染器开发

要求 Node.js 24。安装必须使用锁文件：

```bash
npm ci --prefer-offline --no-audit --no-fund
```

构建指定 Markdown：

```bash
node scripts/build-pdf.mjs input.md dist/output.pdf --theme chatgpt-light
```

也可以使用示例入口：

```bash
npm run build:pdf
npm run build:html
```

运行渲染回归：

```bash
npm test
```

本地命令只用于开发和回归测试，不属于线上任务入口。

## 前端本地开发

```bash
cd frontend
cp .env.example .env.local
npm ci --prefer-offline --no-audit --no-fund
npm run dev
```

前端只允许使用公开变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

任何 `VITE_*` 值都会进入浏览器构建产物，因此不得放入服务端密钥。

## Supabase 初始化

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pdf-job
supabase functions deploy start-pdf-job
supabase functions deploy cancel-pdf-job
supabase functions deploy get-pdf-download
```

Edge Function 自定义 Secrets：

```text
GITHUB_TOKEN
PDF_STORAGE_BUCKET
```

目标仓库、工作流文件和分支已经由 `start-pdf-job` 固定，不需要配置 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_WORKFLOW_FILE` 或 `GITHUB_WORKFLOW_REF`。

Supabase 托管环境自动提供项目 URL 和内置服务端密钥，不要把这些值复制到前端。

## GitHub Actions 配置

网页 PDF 构建使用：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
```

旧项目可以用 `SUPABASE_SERVICE_ROLE_KEY` 代替 `SUPABASE_SECRET_KEY`，二者不需要同时设置。端到端 smoke workflow 还需要公开的 `VITE_SUPABASE_ANON_KEY`。

Cloudflare Pages 部署使用：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Pages 项目固定为 `md-to-pdf-web`，工作流会在首次部署时自动创建项目。详细配置见 [`docs/cloudflare-pages-actions-deploy.md`](docs/cloudflare-pages-actions-deploy.md)。

## 主要目录

```text
frontend/                              React + Vite + TypeScript
scripts/build-pdf.mjs                  Markdown 渲染器
scripts/supabase-pdf-job.mjs           Actions 与 Supabase 任务交互
scripts/prepare-supabase-input.py      ZIP 与输入路径安全处理
themes/                                PDF 主题
supabase/migrations/                   数据库迁移与 RLS
supabase/functions/                    Supabase Edge Functions
.github/workflows/build-pdf-api.yml    网站异步 PDF 构建
.github/workflows/deploy-pages.yml     Pages Direct Upload
```

Supabase 私有 Storage 默认对象路径：

```text
jobs/{job_id}/input.md
jobs/{job_id}/assets.zip
jobs/{job_id}/output.pdf
```

## 安全边界

- Markdown 最大 10 MiB；
- ZIP 最大 50 MiB；
- ZIP 解压总量最大 200 MiB；
- ZIP 最多 2000 个文件；
- 单个解压文件最大 25 MiB；
- 路径最大 240 字符；
- 禁止绝对路径、Windows 盘符、`..`、符号链接和 Zip Slip；
- 用户只能读取自己的任务；
- 取消操作仅允许任务所有者处理尚未启动的 `created/uploaded` 任务；
- `output.pdf` 只能通过短期签名 URL 下载；
- 用户文件只保存于私有 Supabase Storage；
- `GITHUB_TOKEN`、`SUPABASE_SECRET_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 不得进入浏览器、日志或 Artifact。

## 验证命令

根项目：

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run validate:workflows
npm run test:workflows
npm test
python3 -m py_compile scripts/prepare-supabase-input.py
node --check scripts/supabase-pdf-job.mjs
node --check scripts/cleanup-supabase-pdf-jobs.mjs
```

前端：

```bash
cd frontend
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

Edge Functions：

```bash
npx deno check \
  supabase/functions/create-pdf-job/index.ts \
  supabase/functions/start-pdf-job/index.ts \
  supabase/functions/cancel-pdf-job/index.ts \
  supabase/functions/get-pdf-download/index.ts
```

## 文档入口

- AI 与自动化代理规则：[`AGENTS.md`](AGENTS.md)
- Supabase 网页服务：[`docs/supabase-pdf-service.md`](docs/supabase-pdf-service.md)
- Cloudflare Pages 部署：[`docs/cloudflare-pages-actions-deploy.md`](docs/cloudflare-pages-actions-deploy.md)

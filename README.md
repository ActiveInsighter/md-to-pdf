# md-to-pdf

将 Markdown 渲染为接近 Obsidian 阅读模式的 HTML 与 A4 PDF，并提供仓库队列构建和 Supabase 网页异步构建两条互不干扰的路径。

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
- PDF 书签和质量检查；
- 私有 Supabase Storage 异步任务；
- Windows 兼容文件名与压缩包路径校验。

## 架构概览

```text
Cloudflare Pages
    ↓
React 前端
    ↓
Supabase Auth / PostgreSQL / Storage / Realtime / Edge Functions
    ↓
GitHub Actions
    ↓
Markdown → HTML → Chromium → PDF
```

Cloudflare 只负责 Pages 前端托管。生产前端由 GitHub Actions Direct Upload 部署，不使用 Cloudflare Git Integration。

## 两种构建方式

### 仓库队列构建

```text
inbox/** 提交到 main
→ .github/workflows/build-pdf.yml
→ 构建与质量检查
→ 短期 Artifact
→ output 分支保存长期产物
```

该流程适合仓库内管理的批量导出任务。目录规范和 manifest 格式见 [`docs/workflow-guide.md`](docs/workflow-guide.md)。

### Supabase 网页异步构建

```text
用户登录
→ 创建任务
→ 上传 input.md 和可选 assets.zip
→ Edge Function 触发 build-pdf-api.yml
→ Actions 生成 PDF 并上传私有 Storage
→ Realtime 更新状态，轮询兜底
→ 用户获取短期签名下载地址
```

网页用户文件不会提交到 Git 仓库，也不会为每次转换创建 commit。

## 本地快速开始

要求 Node.js 24，并使用仓库锁文件安装依赖：

```bash
npm ci
```

构建示例 PDF：

```bash
npm run build:pdf
```

构建指定文件：

```bash
node scripts/build-pdf.mjs input.md dist/output.pdf --theme chatgpt-light
```

运行仓库队列：

```bash
npm run build:queue
```

运行渲染回归：

```bash
npm test
```

## 前端本地开发

前端暂未提交独立锁文件，安装命令与 CI 保持一致并优先复用 npm 下载缓存：

```bash
cd frontend
cp .env.example .env.local
npm install --prefer-offline --no-audit --no-fund
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

Supabase PDF 构建使用：

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
scripts/                               PDF 渲染、队列与服务脚本
themes/                                PDF 主题
supabase/migrations/                   数据库迁移与 RLS
supabase/functions/                    Supabase Edge Functions
.github/workflows/build-pdf.yml        仓库队列构建
.github/workflows/build-pdf-api.yml    网页异步构建
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
- `output.pdf` 只能通过短期签名 URL 下载；
- 用户文件只保存于私有 Supabase Storage；
- `GITHUB_TOKEN`、`SUPABASE_SECRET_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 不得进入浏览器、日志或 Artifact。

## 验证命令

前端：

```bash
cd frontend
npm run typecheck
npm run build
```

服务脚本：

```bash
python3 -m py_compile scripts/prepare-supabase-input.py
node --check scripts/supabase-pdf-job.mjs
node --check scripts/cleanup-supabase-pdf-jobs.mjs
```

Edge Functions：

```bash
npx deno check \
  supabase/functions/create-pdf-job/index.ts \
  supabase/functions/start-pdf-job/index.ts \
  supabase/functions/get-pdf-download/index.ts
```

## 文档入口

- AI 与自动化代理规则：[`AGENTS.md`](AGENTS.md)
- 仓库队列操作：[`docs/workflow-guide.md`](docs/workflow-guide.md)
- Supabase 网页服务：[`docs/supabase-pdf-service.md`](docs/supabase-pdf-service.md)
- Cloudflare Pages 部署：[`docs/cloudflare-pages-actions-deploy.md`](docs/cloudflare-pages-actions-deploy.md)
- PDF 质量检查：[`docs/pdf-preview-and-quality.md`](docs/pdf-preview-and-quality.md)
- 分支策略：[`docs/branch-policy.md`](docs/branch-policy.md)

项目修改必须通过独立分支和 Pull Request；纯 PDF 导出任务按 [`AGENTS.md`](AGENTS.md) 的快速路径执行。

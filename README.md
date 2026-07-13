# md-to-pdf

将 Markdown 渲染为接近 Obsidian 阅读模式的 HTML 与 A4 PDF，并通过网站提供私有、异步的构建、进度跟踪与下载服务。

```text
Markdown → Markdown-it → KaTeX / Shiki → HTML + CSS → Chromium → PDF
```

默认主题为 `chatgpt-light`。

## 核心能力

- Markdown-it 解析、软换行、目录书签、表格、图片、Callout 与少量原生 HTML；
- KaTeX 行内与块级公式、Shiki 代码高亮；
- Chromium / Puppeteer PDF 渲染与输出校验；
- Supabase Auth、RLS、私有 Storage、Realtime 与短期签名下载；
- GitHub Actions 异步构建、同一任务并发去重与失败回写；
- Windows 兼容文件名、ZIP 路径和解压上限校验；
- 任务收藏、保留期、取消与基于已保留源文件的重新构建。

## 唯一生产链路

```text
Cloudflare Pages 上的 React 前端
→ Supabase Auth / PostgreSQL / 私有 Storage / Edge Functions
→ start-pdf-job 仅触发 build-pdf-api.yml(job_id)
→ GitHub Actions 下载私有输入并调用仓库渲染器
→ PDF 回写 Supabase 私有 Storage，任务状态回写 PostgreSQL
→ 前端以 Realtime 为主、轮询为兜底
→ get-pdf-download 返回短期签名 URL
```

Cloudflare Pages 只托管静态前端，不接收、处理或代理 Markdown、ZIP 与 PDF。用户文件不会写入 Git 仓库、commit、Pull Request 或长期 Artifact；普通代码和文档提交也不会触发 PDF 任务。

不得新增通过仓库文件提交、解析清单或发布分支触发的任务入口。网站构建工作流固定为 [`.github/workflows/build-pdf-api.yml`](.github/workflows/build-pdf-api.yml)，只接受必填的 `job_id`。

## 任务生命周期

标准成功路径单向推进：

```text
created → uploaded → queued → building → uploading → completed
```

- 任一未完成阶段可以进入 `failed`；
- 只有尚未启动的 `created` / `uploaded` 可以进入真实的 `cancelled`；
- `created`、`uploaded`、`completed`、`failed`、`cancelled` 在满足保留策略后可以进入 `expired`；
- `queued`、`building`、`uploading` 不参与过期清理；
- 重复启动和重复取消使用状态条件保证幂等，不会为同一任务并行触发构建；
- 自动下载失败是客户端交付问题，不会把服务端 `completed` 改成失败。

## 六个 Edge Functions

| Function | 职责 |
| --- | --- |
| `create-pdf-job` | 创建归属当前用户的 `created` 任务和受约束的对象路径 |
| `start-pdf-job` | 验证输入已上传，原子推进到 `queued`，仅调度 `build-pdf-api.yml` |
| `cancel-pdf-job` | 仅取消 `created` / `uploaded`，写入 `cancelled` 并清理未启动输入 |
| `get-pdf-download` | 仅为任务所有者的 `completed` 输出签发短期下载 URL |
| `favorite-pdf-job` | 更新收藏与保留期，避免清理竞态 |
| `rebuild-pdf-job` | 在源文件仍受保留时复制私有输入并创建新任务 |

浏览器必须通过这些服务端边界完成状态变更；前端校验不能替代 JWT、任务所有权、RLS、Storage 路径和状态条件检查。

## 本地渲染器开发

要求 Node.js 24，并使用锁文件安装：

```bash
npm ci --prefer-offline --no-audit --no-fund
```

构建指定 Markdown：

```bash
node scripts/build-pdf.mjs input.md dist/output.pdf --theme chatgpt-light
```

也可以使用受控示例入口：

```bash
npm run build:pdf
npm run build:html
```

本地命令只用于开发与回归测试，不属于线上任务入口。测试内容应使用 `fixtures/` 或 `.tmp/`，输出只能进入 `dist/` 或 `.tmp/`。

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

所有 `VITE_*` 值都会进入浏览器构建产物，绝不能保存服务端密钥。

## Supabase 初始化与发布

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pdf-job
supabase functions deploy start-pdf-job
supabase functions deploy cancel-pdf-job
supabase functions deploy get-pdf-download
supabase functions deploy favorite-pdf-job
supabase functions deploy rebuild-pdf-job
```

Edge Function 自定义 Secrets：

```text
GITHUB_TOKEN
PDF_STORAGE_BUCKET
```

目标仓库、`build-pdf-api.yml` 和 `main` 已由 `start-pdf-job` 固定，不需要配置 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_WORKFLOW_FILE` 或 `GITHUB_WORKFLOW_REF`。Supabase 托管环境自动提供项目 URL 与服务端密钥；不要将其复制到前端。

生产发布顺序是：完整验证 → 合并已审查的 PR → 应用数据库迁移 → 部署全部受影响的 Edge Functions → 验证鉴权、CORS 和任务状态 → 手动运行受控 Supabase smoke workflow → 手动部署并验证 Pages 前端。`smoke-supabase-service.yml` 与 `deploy-pages.yml` 均只允许 `workflow_dispatch`，合并或推送 `main` 不会自动运行；触发时必须选择已审查、已合并且后端依赖已就绪的版本。详细步骤和回滚策略见 [Supabase 服务文档](docs/supabase-pdf-service.md)。

## GitHub Actions 配置

网页 PDF 构建与定时清理使用：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
```

旧项目可以使用 `SUPABASE_SERVICE_ROLE_KEY` 代替 `SUPABASE_SECRET_KEY`，二者不需要同时设置。端到端 smoke workflow 还需要公开的 `VITE_SUPABASE_ANON_KEY`。

Cloudflare Pages 部署使用：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

当前部署工作流还使用 `SUPABASE_SECRET_KEY` 或兼容的 `SUPABASE_SERVICE_ROLE_KEY` 管理一次性的已认证 UI 截图账号；该密钥只留在 GitHub runner，不会传入 Vite、Wrangler 或 Pages。Pages 项目固定为 `md-to-pdf-web`，详情见 [Cloudflare Pages 部署文档](docs/cloudflare-pages-actions-deploy.md)。

## 主要目录

```text
frontend/                              React + Vite + TypeScript
scripts/build-pdf.mjs                  Markdown 渲染器
scripts/lib/render-preflight.mjs       渲染前检查
scripts/postprocess-pdfs.mjs           PDF 后处理
scripts/supabase-pdf-job.mjs           Actions 与 Supabase 任务交互
scripts/prepare-supabase-input.py      ZIP 与输入路径安全处理
supabase/migrations/                   数据库迁移、状态约束与 RLS
supabase/functions/                    六个 Supabase Edge Functions
.github/workflows/build-pdf-api.yml    唯一网站 PDF 构建工作流
.github/workflows/deploy-pages.yml     Pages Direct Upload
```

Supabase 私有 Storage 的任务对象路径固定为：

```text
jobs/{job_id}/input.md
jobs/{job_id}/assets.zip
jobs/{job_id}/output.pdf
```

## 安全边界

- Markdown 最大 10 MiB；
- ZIP 最大 50 MiB、最多 2000 个文件，解压总量最大 200 MiB；
- 单个解压文件最大 25 MiB，路径最大 240 字符；
- 禁止绝对路径、Windows 盘符、`..`、符号链接和 Zip Slip；
- 用户只能读取与操作自己的任务；
- 输入上传完成后才能排队，构建成功后才删除输入；
- `output.pdf` 只通过短期签名 URL 下载；
- 用户文件只保存于私有 Supabase Storage；
- `GITHUB_TOKEN`、`SUPABASE_SECRET_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、用户文件内容和签名 URL 不得进入浏览器、仓库、日志或长期 Artifact。

## 验证命令

根项目与工作流：

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run validate:repository
npm run test:repository
npm run validate:workflows
npm run test:workflows
npm test
npm run test:functions
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

六个 Edge Functions：

```bash
npm run check:functions
```

## 文档入口

- AI 与自动化代理规则：[AGENTS.md](AGENTS.md)
- Supabase 架构、发布与回滚：[docs/supabase-pdf-service.md](docs/supabase-pdf-service.md)
- Cloudflare Pages 部署：[docs/cloudflare-pages-actions-deploy.md](docs/cloudflare-pages-actions-deploy.md)
- 贡献与验证流程：[docs/contributor-guide.md](docs/contributor-guide.md)

# Supabase 异步 PDF 构建服务

本功能在不改变现有 Markdown 渲染器的前提下，提供网页异步构建路径：

```text
Cloudflare Pages React 前端
→ Supabase Auth 登录
→ Edge Function 创建 pdf_jobs 任务
→ 浏览器上传 input.md / assets.zip 到私有 Storage
→ Edge Function 触发 build-pdf-api.yml
→ GitHub Actions 复用现有渲染器生成 PDF
→ PDF 上传回私有 Storage
→ Realtime 或轮询刷新任务状态
→ Edge Function 返回短期签名下载 URL
```

原有的 `inbox/** → main → build-pdf.yml → output` 队列流程保持独立，不受网页服务影响。

## 目录与对象路径

```text
supabase/config.toml
supabase/migrations/20260711123000_create_pdf_jobs.sql
supabase/functions/_shared/
supabase/functions/create-pdf-job/
supabase/functions/start-pdf-job/
supabase/functions/get-pdf-download/
frontend/
.github/workflows/build-pdf-api.yml
.github/workflows/cleanup-supabase-pdf-jobs.yml
.github/workflows/smoke-supabase-service.yml
scripts/prepare-supabase-input.py
scripts/supabase-pdf-job.mjs
scripts/cleanup-supabase-pdf-jobs.mjs
```

私有 Bucket 默认为 `pdf-jobs`，对象路径由服务端生成：

```text
jobs/{job_id}/input.md
jobs/{job_id}/assets.zip
jobs/{job_id}/output.pdf
```

## 当前数据库模型

现有迁移创建 `public.pdf_jobs`，保存任务所有权、文件路径、主题、选项、GitHub 运行信息、错误摘要和过期时间。

当前服务端状态为：

```text
created → uploaded → queued → building → uploading → completed
failed
expired
```

普通 `authenticated` 用户只能查询自己的任务，不能直接更新任务状态。任务创建、状态变更和输出写入由 Edge Functions 或 GitHub Actions 使用服务端凭据完成。

Storage 策略仅允许用户在自己的任务仍处于 `created` 状态时上传或覆盖 `input.md` 与 `assets.zip`。用户不能直接读取 `output.pdf`，下载必须通过 Edge Function 生成的短期签名 URL。

## Supabase 初始化

安装 Supabase CLI 后，在仓库根目录执行：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pdf-job
supabase functions deploy start-pdf-job
supabase functions deploy get-pdf-download
```

迁移会创建任务表、RLS、私有 Bucket、Storage Policy，并把 `pdf_jobs` 加入 Realtime publication。

## Supabase Edge Function Secrets

项目的 GitHub 仓库、工作流文件和目标分支已在 `start-pdf-job` 中固定，部署时只需要设置以下自定义 Secret：

```bash
supabase secrets set GITHUB_TOKEN=github_pat_xxx
supabase secrets set PDF_STORAGE_BUCKET=pdf-jobs
```

用途：

- `GITHUB_TOKEN`：触发固定仓库中的 `build-pdf-api.yml`；
- `PDF_STORAGE_BUCKET`：私有任务 Bucket，未设置时默认为 `pdf-jobs`。

Supabase 托管 Edge Functions 自动提供项目 URL、公开密钥和服务端密钥。代码兼容托管环境提供的 JSON 密钥变量及旧版单密钥变量，不需要把这些内置值重复配置为自定义 Secret。

服务端密钥和 `GITHUB_TOKEN` 绝不能进入前端环境变量、构建产物、日志或 Artifact。

## GitHub Fine-grained Token

为 Edge Function 创建 Fine-grained personal access token：

```text
Repository access: Only select repositories
Repository: ActiveInsighter/md-to-pdf
Repository permissions:
  Actions: Read and write
  Metadata: Read-only
```

该 Token 只保存为 Supabase Edge Function Secret `GITHUB_TOKEN`。

## GitHub Actions Secrets

仓库 `Settings → Secrets and variables → Actions` 中配置：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
```

其中：

- `SUPABASE_SECRET_KEY` 为推荐的服务端 Secret Key；
- 旧项目可以改用 `SUPABASE_SERVICE_ROLE_KEY` 作为兼容方案，两者不需要同时设置；
- `SUPABASE_STORAGE_BUCKET` 通常填写 `pdf-jobs`。

端到端 smoke workflow 还需要公开的：

```text
VITE_SUPABASE_ANON_KEY
```

它用于测试用户登录，不是服务端密钥。

## Cloudflare Pages

前端通过 `.github/workflows/deploy-pages.yml` 使用 Cloudflare Pages Direct Upload 部署，不使用 Cloudflare Git Integration。

因此 Cloudflare Pages 控制台中不需要配置框架、仓库根目录、构建命令或输出目录，也不需要导入 GitHub 仓库。部署工作流负责：

```text
安装前端依赖
→ TypeScript 检查
→ Vite 构建 frontend/dist
→ 创建或复用 md-to-pdf-web Pages 项目
→ Wrangler Direct Upload
```

Cloudflare 部署所需变量和 Supabase Auth 回调地址见 [`cloudflare-pages-actions-deploy.md`](cloudflare-pages-actions-deploy.md)。

浏览器中只允许使用：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## 安全限制

`assets.zip` 处理限制：

- ZIP 最大 50 MiB；
- 最多 2000 个条目；
- 解压总量最大 200 MiB；
- 单文件最大 25 MiB；
- 路径最大 240 字符；
- 禁止绝对路径、Windows 盘符、`..`、符号链接和 Zip Slip；
- 所有路径必须兼容 Windows；
- 文件只能解压到当前任务的临时工作目录。

Markdown 最大 10 MiB。用户文件不会提交到 Git 仓库，也不会进入成功任务的长期调试 Artifact。

## 清理与保留

- 任务默认在创建 7 天后过期；
- 构建成功后 Actions 尝试删除 `input.md` 和 `assets.zip`；
- 每日清理工作流删除过期任务对象并把状态更新为 `expired`；
- 单个任务清理失败不应阻塞后续任务；
- 清理日志不得输出密钥或签名 URL。

## 本地验证

前端：

```bash
cd frontend
npm install --no-audit --no-fund
npm run typecheck
npm run build
```

Edge Functions：

```bash
npx deno check \
  supabase/functions/create-pdf-job/index.ts \
  supabase/functions/start-pdf-job/index.ts \
  supabase/functions/get-pdf-download/index.ts
```

服务脚本：

```bash
python3 -m py_compile scripts/prepare-supabase-input.py
node --check scripts/supabase-pdf-job.mjs
node --check scripts/cleanup-supabase-pdf-jobs.mjs
```

端到端 smoke test：

```bash
cd frontend
npm run smoke:supabase
```

运行 smoke test 前需要提供对应的 Supabase 和 GitHub Actions 环境变量。测试会创建临时用户和任务，验证登录、上传、调度、PDF 文件头、签名下载与清理流程。

## 常见错误

- `401`：前端会话失效，重新登录；
- 上传被 RLS 拒绝：检查迁移、Bucket 和对象路径；
- workflow dispatch 返回 `404`：确认工作流已存在于默认分支，并检查 Token 仓库范围；
- workflow dispatch 返回权限错误：检查 Token 的 Actions 写权限；
- Actions 下载对象失败：确认 `input.md` 已上传且 Bucket 配置一致；
- 状态不变化：检查 Actions 的 Supabase 服务端 Secret；
- Realtime 无事件：确认迁移已加入 publication，轮询仍会作为兜底。

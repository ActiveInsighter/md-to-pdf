# Supabase 异步 PDF 构建服务

本功能在不改变现有 Markdown 渲染器的前提下，增加一条网页异步构建路径：

```text
Cloudflare Pages React 前端
→ Supabase Auth 登录
→ Edge Function 创建 pdf_jobs 任务
→ 浏览器直接上传 input.md / assets.zip 到私有 Storage
→ Edge Function 触发 build-pdf-api.yml
→ GitHub Actions 下载输入并复用 scripts/build-pdf.mjs
→ PDF 上传回私有 Storage
→ Actions 使用 service_role 更新数据库状态
→ Realtime 或 10 秒轮询刷新前端
→ Edge Function 返回一小时签名下载 URL
```

旧的 `inbox/** → main → build-pdf.yml` 流程保持不变。

## 目录与对象路径

```text
supabase/config.toml
supabase/migrations/20260711123000_create_pdf_jobs.sql
supabase/functions/create-pdf-job/
supabase/functions/start-pdf-job/
supabase/functions/get-pdf-download/
frontend/
.github/workflows/build-pdf-api.yml
.github/workflows/cleanup-supabase-pdf-jobs.yml
scripts/prepare-supabase-input.py
scripts/supabase-pdf-job.mjs
scripts/cleanup-supabase-pdf-jobs.mjs
```

私有 Bucket 固定为 `pdf-jobs`：

```text
jobs/{job_id}/input.md
jobs/{job_id}/assets.zip
jobs/{job_id}/output.pdf
```

## 数据库与 RLS

迁移创建 `public.pdf_jobs`，包含所有权、状态、路径、主题、GitHub 运行信息、错误摘要和过期时间。状态受 CHECK 约束：

```text
created → uploaded → queued → building → uploading → completed
failed
expired
```

普通 `authenticated` 用户只获得 `SELECT` 权限，并且 RLS 仅允许读取 `user_id = auth.uid()` 的行。创建与状态变更全部由 Edge Function 或 Actions 的服务端密钥完成。

Storage 策略只允许登录用户在任务仍为 `created` 时上传或覆盖自己任务的 `input.md` 与 `assets.zip`。用户没有直接读取 `output.pdf` 的策略，最终下载必须通过短期签名 URL。

## Supabase 初始化

安装 Supabase CLI 后：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pdf-job
supabase functions deploy start-pdf-job
supabase functions deploy get-pdf-download
```

迁移会创建私有 Bucket、表、RLS、Storage Policy，并把 `pdf_jobs` 加入 `supabase_realtime` publication。

如果项目的 Data API 设置不是自动暴露新表，请在 Supabase 控制台确认 `public` schema 已暴露。本迁移已经显式向 `authenticated` 授予表的 SELECT 权限。

## Edge Function Secrets

Supabase 不允许自定义 Secret 使用 `SUPABASE_` 保留前缀，因此 Bucket 配置使用 `PDF_STORAGE_BUCKET`：

```bash
supabase secrets set GITHUB_TOKEN=github_pat_xxx
supabase secrets set GITHUB_OWNER=ActiveInsighter
supabase secrets set GITHUB_REPO=md-to-pdf
supabase secrets set GITHUB_WORKFLOW_FILE=build-pdf-api.yml
supabase secrets set GITHUB_WORKFLOW_REF=main
supabase secrets set PDF_STORAGE_BUCKET=pdf-jobs
```

Supabase 托管 Edge Functions 自动提供：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_PUBLISHABLE_KEYS
SUPABASE_SECRET_KEYS
SUPABASE_SERVICE_ROLE_KEY
```

这些内置变量不需要、也不能以自定义 Secret 的方式重复添加。`SUPABASE_SECRET_KEYS`、旧版 `SUPABASE_SERVICE_ROLE_KEY` 和 `GITHUB_TOKEN` 绝对不能进入前端。

## GitHub Fine-grained Token

为 Edge Function 创建 Fine-grained personal access token：

```text
Repository access: Only select repositories
Repository: ActiveInsighter/md-to-pdf
Repository permissions:
  Actions: Read and write
  Metadata: Read-only
```

这个 Token 只存入 Supabase Secret `GITHUB_TOKEN`。GitHub Actions 不需要存储该 Token。

## GitHub Actions Secrets

仓库 `Settings → Secrets and variables → Actions` 添加：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY（推荐）
SUPABASE_SERVICE_ROLE_KEY（旧版兼容，二选一）
SUPABASE_STORAGE_BUCKET
```

其中 Bucket 值固定为：

```text
pdf-jobs
```

优先在 Supabase `Settings → API Keys → Secret keys` 创建 `sb_secret_...`，并填入 `SUPABASE_SECRET_KEY`。只有需要兼容旧项目时才改用 Legacy API Keys 中的 `service_role`，填入 `SUPABASE_SERVICE_ROLE_KEY`。两者不需要同时设置。

## Cloudflare Pages

Root directory：

```text
frontend
```

Build command：

```text
npm install --no-audit --no-fund && npm run build
```

Output directory：

```text
dist
```

环境变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

`VITE_*` 会进入浏览器，所以这里只能放 Supabase URL 与公开的 publishable/anon key。

## 安全解压

`assets.zip` 会检查：

- ZIP 文件最大 50 MiB；
- 最多 2000 个条目；
- 解压总量最大 200 MiB；
- 单文件最大 25 MiB；
- 路径最大 240 字符；
- 禁止绝对路径、盘符、`..`、符号链接和 Zip Slip；
- 所有文件只能写入本任务的 `work/source`。

Markdown 固定复制为 `work/source/input.md`，因此压缩包中的相对图片路径可以继续使用。

## 清理与保留

- 任务默认 `expires_at = 创建时间 + 7 天`；
- 构建成功后 Actions 尝试立即删除 `input.md` 和 `assets.zip`；
- `cleanup-supabase-pdf-jobs.yml` 每天删除过期任务的全部对象，并把状态改为 `expired`；
- PDF 默认最多保留 7 天；
- 清理单个任务失败只记录任务 ID 与错误摘要，不输出任何密钥。

## 测试流程

1. 注册并登录前端。
2. 上传纯文字、中文、KaTeX、代码块 Markdown。
3. 上传引用相对图片的 Markdown 和对应 `assets.zip`。
4. 验证不带 ZIP 的任务正常完成。
5. 验证任务状态依次更新，Realtime 断开时 10 秒轮询仍可完成。
6. 验证另一个用户无法读取任务行或覆盖输入对象。
7. 验证重复调用 start 返回已有状态，不产生第二次 dispatch。
8. 验证失败时 Actions 把任务改为 `failed`。
9. 验证完成后只能通过 Edge Function 获取一小时签名下载 URL。
10. 验证过期清理删除 Storage 对象并设置 `expired`。

## 常见错误

- `401`：前端会话失效，重新登录。
- 上传被 RLS 拒绝：检查迁移、Bucket 名称和对象路径是否完全一致。
- workflow dispatch 返回 `404`：确认 `build-pdf-api.yml` 已合并到默认分支，并检查 Token 的 Actions 权限。
- Actions 下载 `404`：检查是否上传了 `input.md`，以及 Bucket 是否为 `pdf-jobs`。
- 状态不变化：检查 Actions 中的三个 Supabase Secrets，尤其是 `SUPABASE_SECRET_KEY` 或旧版 `SUPABASE_SERVICE_ROLE_KEY`。
- Realtime 无事件：确认迁移已将 `pdf_jobs` 加入 `supabase_realtime` publication；轮询仍会兜底。

> `SUPABASE_SECRET_KEY` 和旧版 `SUPABASE_SERVICE_ROLE_KEY` 绝对不能暴露在浏览器端。
>
> `GITHUB_TOKEN` 绝对不能放在任何 `VITE_*` 前端环境变量中。

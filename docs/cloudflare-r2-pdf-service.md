# Cloudflare R2 异步 PDF 构建服务

本项目新增一条独立于仓库队列的构建路径：

```text
React 前端
→ Cloudflare Worker 创建 D1 任务
→ 浏览器使用短期签名 PUT URL 上传到私有 R2
→ Worker 触发 build-pdf-r2.yml 的 workflow_dispatch
→ GitHub Actions 下载输入并调用现有 scripts/build-pdf.mjs
→ Actions 上传 result.pdf 到 R2
→ Actions 回调 Worker 更新状态
→ 前端轮询状态并获取短期签名 GET URL
```

旧的 `inbox/** → push main → Actions → output` 流程仍然保留。

> `workflow_dispatch` 只能稳定触发默认分支上已经存在的工作流文件。因此需要先把本功能 PR 合并到 `main`，再从 Worker 触发 `build-pdf-r2.yml`。

## 1. 新增目录

```text
frontend/                 React + Vite 前端
worker/                   Cloudflare Worker + D1 API
worker/migrations/        D1 表结构
scripts/prepare-r2-input.mjs
.github/workflows/build-pdf-r2.yml
```

## 2. 创建 R2 Bucket

在 Cloudflare 控制台中创建私有 Bucket，例如：

```text
md-to-pdf-jobs
```

不要启用公开访问。输入和输出统一放在：

```text
jobs/{jobId}/input/source.md
jobs/{jobId}/input/source.zip
jobs/{jobId}/output/result.pdf
```

建议额外配置对象生命周期规则，按需要自动清理旧任务文件。

## 3. 创建受限 R2 API Token

在 Cloudflare 的 R2 API Token 页面创建 S3 API 凭据：

```text
权限：Object Read & Write
Bucket：只选择 md-to-pdf-jobs
```

保存生成的：

```text
Access Key ID
Secret Access Key
```

同一组凭据需要同时配置到 Worker 和 GitHub Actions。不要提交到仓库。

## 4. 配置 R2 CORS

把 `docs/r2-cors.json` 中的域名替换成真实 Cloudflare Pages 域名，然后在 R2 Bucket 的 CORS 设置中保存。

上传 URL 会签入 `Content-Type`，前端必须使用 Worker 返回的相同类型：

```text
Markdown: text/markdown
ZIP: application/zip
```

## 5. 创建 D1 数据库

在 `worker/` 目录执行：

```bash
npm install
npx wrangler d1 create PDF_JOBS_DB
```

把命令返回的 `database_id` 写入 `worker/wrangler.jsonc`。

应用迁移：

```bash
npm run db:migrate:remote
```

## 6. 创建 GitHub Fine-grained Token

该 Token 由 Worker 用来调用 GitHub REST API 触发工作流。

建议配置：

```text
Repository access：Only select repositories
Repository：ActiveInsighter/md-to-pdf
Repository permissions：Actions = Read and write
```

Token 只写入 Worker Secret `GITHUB_TOKEN`，不要写入 GitHub Actions Secret，也不要放进前端。

## 7. 配置 Worker

先修改 `worker/wrangler.jsonc`：

```text
R2_ACCOUNT_ID
R2_BUCKET
FRONTEND_ORIGIN
D1 database_id
R2 bucket binding 的 bucket_name
```

然后在 `worker/` 目录依次写入 Secret：

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put PDF_CALLBACK_SECRET
npx wrangler secret put PDF_API_TOKEN
```

推荐生成两个不同的长随机值：

```bash
openssl rand -hex 32
```

用途：

```text
PDF_CALLBACK_SECRET：仅 GitHub Actions 回调 Worker 使用
PDF_API_TOKEN：个人前端访问 API 使用
```

部署：

```bash
npm run typecheck
npm run deploy
```

部署后记录 Worker 地址，例如：

```text
https://md-to-pdf-api.example.workers.dev
```

## 8. 配置 GitHub Actions Secrets

在仓库：

```text
Settings
→ Secrets and variables
→ Actions
→ Repository secrets
```

新增以下六项：

```text
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ACCOUNT_ID
R2_BUCKET
PDF_CALLBACK_URL
PDF_CALLBACK_SECRET
```

具体值：

```text
R2_ACCOUNT_ID：Cloudflare Account ID
R2_BUCKET：md-to-pdf-jobs
PDF_CALLBACK_URL：Worker 根地址，不要带结尾斜杠
PDF_CALLBACK_SECRET：必须与 Worker Secret 完全一致
```

`GITHUB_TOKEN` 不需要配置到 Actions；它属于 Worker Secret。

## 9. 部署前端

在 `frontend/` 目录执行：

```bash
npm install
cp .env.example .env.production
```

设置：

```text
VITE_API_BASE_URL=https://你的-worker.workers.dev
```

本地验证：

```bash
npm run typecheck
npm run build
```

Cloudflare Pages 配置：

```text
Root directory：frontend
Build command：npm run build
Build output directory：dist
Environment variable：VITE_API_BASE_URL
```

前端不包含永久密钥。使用时手动输入 `PDF_API_TOKEN`，它只保存在浏览器 `sessionStorage`。

## 10. 状态与幂等性

D1 状态流转：

```text
created
→ uploading
→ uploaded
→ queued
→ processing
→ uploading_result
→ completed
```

失败进入 `failed`。

启动接口使用条件更新从 `uploaded` 原子切换到 `queued`。重复点击时，只有第一次请求可以触发 GitHub Actions，其余请求返回现有状态。

GitHub 的 workflow dispatch 接口本身不返回 run ID，因此 run ID 由工作流启动后通过内部回调写回 D1。

## 11. 输入限制

默认限制：

```text
上传文件：50 MiB
ZIP 文件数：2000
ZIP 解压总大小：200 MiB
签名 URL：10 分钟
```

ZIP 禁止：

```text
绝对路径
.. 路径穿越
符号链接
空压缩包
没有 Markdown
多个入口 Markdown 且没有 source.md 或 index.md
```

包含多份 Markdown 时，把主文件命名为：

```text
source.md
```

或：

```text
index.md
```

## 12. 验证流程

1. 打开前端并输入 `PDF_API_TOKEN`。
2. 上传一个 `.md`，确认 R2 出现 `jobs/{jobId}/input/source.md`。
3. 点击构建，确认 D1 状态变为 `queued`。
4. 确认 GitHub Actions 出现名称为 `PDF job {jobId}` 的运行。
5. 确认运行先回调 `processing`，再调用现有 `scripts/build-pdf.mjs`。
6. 确认 R2 出现 `jobs/{jobId}/output/result.pdf`。
7. 确认任务变为 `completed`，前端出现下载按钮。
8. 重复点击启动接口，确认不会产生第二个 Actions 运行。
9. 使用错误访问令牌查询任务，确认返回 `401`。
10. 修改回调 Secret 做失败测试，确认 Actions 明确报错且任务不会被错误标记为完成。

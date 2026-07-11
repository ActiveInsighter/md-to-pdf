# md-to-pdf

把 Markdown 笔记渲染为接近 Obsidian 阅读模式的 HTML 和 A4 PDF，并提供两种互不干扰的构建方式：

```text
Markdown → Markdown-it → KaTeX / Shiki → HTML + CSS → Chromium → PDF
```

默认主题：`chatgpt-light`。

## 两种构建方式

### 仓库队列构建（原有方式）

```text
inbox/** 提交到 main
→ .github/workflows/build-pdf.yml
→ 构建、质量检查和短期 Artifact
→ output 分支保存长期产物
```

该流程继续保留，适合仓库内管理的批量导出任务。

### Supabase 网页异步构建（新增方式）

```text
Cloudflare Pages 前端
→ Supabase Auth 登录
→ Edge Function 创建任务
→ 浏览器上传 Markdown 和可选 assets.zip 到私有 Storage
→ Edge Function 触发 build-pdf-api.yml
→ GitHub Actions 复用现有渲染器生成 PDF
→ PDF 上传回 Supabase Storage
→ Realtime 或轮询刷新状态
→ Edge Function 返回短期签名下载地址
```

用户文件不会提交到 Git 仓库，也不会为每次转换创建 commit。

详细部署文档：[`docs/supabase-pdf-service.md`](docs/supabase-pdf-service.md)。

> `SUPABASE_SERVICE_ROLE_KEY` 绝对不能暴露在浏览器端。
>
> `GITHUB_TOKEN` 绝对不能放在任何 `VITE_*` 前端环境变量中。

## 快速入口

- AI 与自动化代理：[`AGENTS.md`](AGENTS.md)
- 可复制导出提示词：[`docs/ai-export-prompt.md`](docs/ai-export-prompt.md)
- 原有队列流程：[`docs/workflow-guide.md`](docs/workflow-guide.md)
- 分支规则：[`docs/branch-policy.md`](docs/branch-policy.md)
- PDF 质量检查：[`docs/pdf-preview-and-quality.md`](docs/pdf-preview-and-quality.md)
- Supabase 网页服务：[`docs/supabase-pdf-service.md`](docs/supabase-pdf-service.md)

## 原有队列目录

```text
inbox/
  YYYY/
    MM/
      YYYY-MM-DD/
        manifest.yml
        md/
          001-第一篇.md
        img/
          figure-01.svg
        attachments/
          source.pdf
```

Markdown 从 `md/` 引用图片：

```markdown
![示例图片](../img/figure-01.svg)
```

文件名必须兼容 Windows，避免：

```text
\ / : * ? " < > |
```

## manifest 示例

```yaml
version: 1
date: 2026-07-10
title: 学习笔记合集
theme: chatgpt-light

jobs:
  - id: study-notes
    type: merge
    title: 学习笔记合集
    inputs: all
    sort: filename
    page_break: true
    output: 学习笔记合集.pdf
```

## 原有构建状态和产物

运行状态：

```text
.github/latest-run.json
```

输出索引：

```text
.github/latest-output.json
```

短期 Artifact：

```text
obsidian-style-pdf
```

长期产物位于 `output` 分支：

```text
YYYY/MM/YYYY-MM-DD/文件名.pdf
```

自动质量检查包括：

- PDF 文件头、文件大小和页数；
- 疑似空白页；
- 图片加载失败；
- KaTeX 渲染错误；
- 横向溢出；
- 浏览器控制台和页面错误。

## Supabase 网页服务目录

```text
frontend/                              React + Vite + TypeScript
supabase/config.toml                   Supabase 本地配置
supabase/migrations/                   数据库、RLS、Storage Policy
supabase/functions/create-pdf-job/     创建任务
supabase/functions/start-pdf-job/      校验上传并触发 Actions
supabase/functions/get-pdf-download/   生成私有 PDF 签名地址
.github/workflows/build-pdf-api.yml     API 异步构建
.github/workflows/cleanup-supabase-pdf-jobs.yml
scripts/prepare-supabase-input.py      ZIP 安全解压
scripts/supabase-pdf-job.mjs           Actions 与 Supabase 通信
```

私有 Storage Bucket：

```text
pdf-jobs
```

对象路径：

```text
jobs/{job_id}/input.md
jobs/{job_id}/assets.zip
jobs/{job_id}/output.pdf
```

## Supabase 初始化

安装并登录 Supabase CLI，然后在仓库根目录执行：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pdf-job
supabase functions deploy start-pdf-job
supabase functions deploy get-pdf-download
```

迁移会完成：

- 创建 `public.pdf_jobs`；
- 开启 RLS；
- 普通用户只能读取自己的任务；
- 创建私有 `pdf-jobs` Bucket；
- 允许用户只上传自己仍处于 `created` 状态的输入文件；
- 禁止用户直接读取 `output.pdf`；
- 把 `pdf_jobs` 加入 Realtime publication。

## Edge Function 配置

需要在 Supabase Functions Secrets 中添加：

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_WORKFLOW_FILE
GITHUB_WORKFLOW_REF
SUPABASE_STORAGE_BUCKET
```

推荐值：

```text
GITHUB_OWNER=ActiveInsighter
GITHUB_REPO=md-to-pdf
GITHUB_WORKFLOW_FILE=build-pdf-api.yml
GITHUB_WORKFLOW_REF=main
SUPABASE_STORAGE_BUCKET=pdf-jobs
```

托管 Edge Functions 通常自动提供：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

应在 Functions Secrets 页面确认它们存在，但不要把服务端密钥复制到前端。

## GitHub Actions Secrets

仓库设置中添加：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

工作流只接收：

```yaml
inputs:
  job_id:
    required: true
    type: string
```

Actions 会从数据库读取已校验的主题和选项，不接收完整 Markdown，也不信任前端传入任意对象路径。

## GitHub Token 最小权限

Edge Function 触发工作流所用 Fine-grained personal access token：

```text
Repository access: Only select repositories
Repository: ActiveInsighter/md-to-pdf
Repository permissions:
  Actions: Read and write
  Metadata: Read-only
```

该 Token 只放在 Supabase Secret `GITHUB_TOKEN`。

## Cloudflare Pages 前端

配置：

```text
Root directory: frontend
Build command: npm install --no-audit --no-fund && npm run build
Output directory: dist
```

前端环境变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

这两个值用于浏览器初始化 Supabase 客户端。`VITE_SUPABASE_ANON_KEY` 可以填写项目的 publishable key 或旧版 anon key。

## 前端功能

- 邮箱密码注册、登录和退出；
- Markdown 与可选 `assets.zip` 上传；
- 上传阶段进度；
- `chatgpt-light` 主题；
- 任务状态、错误信息和 GitHub Actions 链接；
- Realtime 更新；
- 每 10 秒轮询兜底；
- 页面刷新后恢复当前任务；
- 最近任务列表；
- 一小时有效的私有 PDF 下载地址。

## 安全限制

- Markdown 最大 10 MiB；
- ZIP 最大 50 MiB；
- 解压总量最大 200 MiB；
- 最多 2000 个 ZIP 条目；
- 单文件最大 25 MiB；
- 路径最大 240 字符；
- 禁止绝对路径、盘符、`..`、符号链接和 Zip Slip；
- 用户只能读取自己的 `pdf_jobs` 行；
- 用户不能把任务直接改成 `completed`；
- Storage 路径由后端根据 UUID 生成；
- service role 和 GitHub Token 不写入日志、Artifact 或前端。

## 清理策略

- 每个任务默认 7 天后过期；
- 构建成功后尝试立即删除 `input.md` 和 `assets.zip`；
- 每日清理工作流删除过期对象；
- 过期任务状态更新为 `expired`；
- PDF 最多保留到任务过期时间。

## Markdown 支持

支持：

```text
标题、段落、粗体、斜体、删除线、高亮
有序列表、无序列表、任务列表
引用、Callout、表格、链接、图片
KaTeX 数学公式、Shiki 代码高亮
少量原生 HTML 与 Obsidian 双链
```

行内公式：

```text
\( x^2 + y^2 = r^2 \)
```

块级公式：

```latex
\[
E = mc^2
\]
```

## 本地渲染命令

安装依赖：

```bash
npm ci
```

构建单个 PDF：

```bash
npm run build:pdf
node scripts/build-pdf.mjs input.md dist/output.pdf --theme chatgpt-light
```

构建队列：

```bash
npm run build:queue
```

运行渲染回归：

```bash
npm test
```

## 前端本地开发

```bash
cd frontend
cp .env.example .env.local
npm install --no-audit --no-fund
npm run dev
```

## 部署前检查

```bash
cd frontend
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

安全输入脚本：

```bash
python3 -m py_compile scripts/prepare-supabase-input.py
node --check scripts/supabase-pdf-job.mjs
node --check scripts/cleanup-supabase-pdf-jobs.mjs
```

## 核心规则

- `main` 保存程序、队列和运行状态，不长期保存网页用户文件；
- `output` 只保存原有队列流程的生成产物；
- 网页上传的 Markdown、资源和 PDF 只进入 Supabase Storage；
- 原有工作流与 API 工作流彼此独立；
- 构建完成前不要声称 PDF 已经生成；
- 不提交任何真实密钥。

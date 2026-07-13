# Supabase 异步 PDF 构建服务

本文是生产架构、Supabase 配置、发布验证与回滚的操作手册。线上 PDF 任务只有一条路径：

```text
Cloudflare Pages React 前端
→ Supabase Auth 登录
→ create-pdf-job 创建归属当前用户的任务
→ 浏览器按 RLS 上传 input.md / assets.zip 到私有 Storage
→ start-pdf-job 校验输入并仅触发 build-pdf-api.yml(job_id)
→ GitHub Actions 获取私有输入、校验 ZIP、调用仓库渲染器
→ output.pdf 回写私有 Storage，状态回写 PostgreSQL
→ Realtime 推送状态，前端轮询兜底
→ get-pdf-download 返回短期签名 URL
```

Cloudflare Pages 只托管前端，不处理 PDF 文件。用户 Markdown、ZIP、图片与 PDF 不得进入仓库、commit、Pull Request 或长期 Artifact。

## 组件边界

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Cloudflare Pages | 托管经过验证的静态前端 | 文件接收、PDF 渲染、服务端密钥 |
| React 前端 | 登录、上传、展示状态、请求签名下载 | 绕过 RLS、直接更新任务状态、保存服务端密钥 |
| Supabase | Auth、任务所有权、状态约束、私有对象、Realtime、Edge Functions | 渲染 Chromium PDF |
| `build-pdf-api.yml` | 按必填 `job_id` 取输入、构建、上传、回写状态 | 接收仓库文件队列、提交产物或长期保存用户输入 |

网站 PDF 工作流固定为 [`.github/workflows/build-pdf-api.yml`](../.github/workflows/build-pdf-api.yml)。它只允许 `workflow_dispatch` 和必填的 `job_id`，`permissions.contents` 为只读，checkout 不持久化凭据。同一 `job_id` 使用固定 concurrency group，不能并行构建。

## 目录与对象路径

```text
supabase/config.toml
supabase/migrations/
supabase/functions/_shared/
supabase/functions/create-pdf-job/
supabase/functions/start-pdf-job/
supabase/functions/cancel-pdf-job/
supabase/functions/get-pdf-download/
supabase/functions/favorite-pdf-job/
supabase/functions/rebuild-pdf-job/
frontend/
.github/workflows/build-pdf-api.yml
.github/workflows/cleanup-supabase-pdf-jobs.yml
.github/workflows/smoke-supabase-service.yml
scripts/prepare-supabase-input.py
scripts/supabase-pdf-job.mjs
scripts/cleanup-supabase-pdf-jobs.mjs
```

私有 Bucket 默认为 `pdf-jobs`。所有任务路径由服务端根据 UUID 生成并受数据库约束：

```text
jobs/{job_id}/input.md
jobs/{job_id}/assets.zip
jobs/{job_id}/output.pdf
```

不得接受客户端提供的任意 Storage 路径。

## 数据库与任务生命周期

`public.pdf_jobs` 保存任务所有权、文件名、受约束的对象路径、主题、选项、GitHub 运行信息、进度、诊断摘要、收藏标记、来源任务和保留期。

标准成功路径为：

```text
created → uploaded → queued → building → uploading → completed
```

数据库状态约束和触发器只允许以下跨状态转换：

| 当前状态 | 允许进入 |
| --- | --- |
| `created` | `uploaded`、`failed`、`cancelled`、`expired` |
| `uploaded` | `queued`、`failed`、`cancelled`、`expired` |
| `queued` | `building`、`failed` |
| `building` | `uploading`、`failed` |
| `uploading` | `completed`、`failed` |
| `completed`、`failed`、`cancelled` | `expired` |
| `expired` | 无 |

同状态更新可用于幂等回写。`cancelled` 是独立的真实状态，不使用 `failed` 代替；只有尚未启动的 `created` / `uploaded` 可以取消。`queued`、`building`、`uploading` 不可取消，也不会被过期清理抢占。

状态变更同步进度阶段和生命周期时间。服务端完成后，前端自动下载失败不会回写或改变 `completed`。

普通 `authenticated` 用户只能查询自己的任务，不能直接写任务状态。数据库迁移负责表约束、索引、RLS、私有 Bucket、Storage Policy、状态触发器，并将 `pdf_jobs` 加入 Realtime publication。

Storage Policy 仅允许任务所有者在任务仍为 `created` 时上传或覆盖自己的 `input.md` 与可选 `assets.zip`。浏览器不能直接读取 `output.pdf`；下载必须经过 `get-pdf-download` 的所有权与 `completed` 状态检查。

## 六个 Edge Functions

六个函数都要求有效 JWT，并在服务端重新校验任务所有权。浏览器的 UI 状态和参数检查只用于体验，不能作为安全边界。

| Function | 请求作用与关键约束 |
| --- | --- |
| `create-pdf-job` | 规范化文件名、限制主题与选项，创建 `created` 记录及固定对象路径 |
| `start-pdf-job` | 检查输入对象存在且未超限，原子推进 `uploaded → queued`，幂等处理重复请求，只调度固定仓库 `main` 上的 `build-pdf-api.yml` |
| `cancel-pdf-job` | 使用所有者和状态条件将 `created` / `uploaded` 原子更新为 `cancelled`，再清理输入；与启动竞争时以数据库更新结果为准 |
| `get-pdf-download` | 只为所有者的 `completed` 任务生成 1 小时签名 URL 和安全下载文件名 |
| `favorite-pdf-job` | 原子更新收藏标记；取消收藏时重算保留期，已进入清理的任务返回冲突 |
| `rebuild-pdf-job` | 仅在原任务输入对象仍保留时复制到新 UUID 路径并创建 `created` 任务；不会复用原任务 ID |

`rebuild-pdf-job` 创建后仍需调用 `start-pdf-job` 才会排队。构建成功后输入会被删除，因此“重新构建”只对仍有受保留源对象的任务可用，不能依赖前端显示状态假定源文件存在。

## 安全与文件限制

Markdown 最大 10 MiB。`assets.zip` 处理限制：

- ZIP 最大 50 MiB；
- 最多 2000 个条目；
- 解压总量最大 200 MiB；
- 单文件最大 25 MiB；
- 路径最大 240 字符；
- 禁止绝对路径、Windows 盘符、`..`、符号链接和 Zip Slip；
- 所有路径必须兼容 Windows；
- 文件只能解压到当前任务的临时工作目录。

GitHub Actions 成功生成并上传 PDF 后才删除输入对象。失败时只保留必要的清洗后诊断，不能输出密钥、用户文件内容或签名 URL；短期 Debug Artifact 不能包含用户输入、PDF 或服务端凭据。

## Secrets

### Supabase Edge Function Secrets

目标仓库、工作流和目标分支固定在 `start-pdf-job` 中。仅设置自定义 Secret：

```bash
supabase secrets set GITHUB_TOKEN=github_pat_xxx
supabase secrets set PDF_STORAGE_BUCKET=pdf-jobs
```

- `GITHUB_TOKEN`：Fine-grained token，仅选择本仓库，`Actions: Read and write`、`Metadata: Read-only`；
- `PDF_STORAGE_BUCKET`：私有任务 Bucket，未设置时默认为 `pdf-jobs`。

Supabase 托管 Edge Functions 自动提供项目 URL、公开密钥与服务端密钥，不需要把内置值重复设为自定义 Secret。服务端密钥和 `GITHUB_TOKEN` 绝不能进入 `VITE_*`、浏览器、构建产物或日志。

### GitHub Actions Repository Secrets

PDF 构建、清理与 smoke test 使用：

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
VITE_SUPABASE_ANON_KEY
```

`SUPABASE_SECRET_KEY` 是推荐的服务端密钥。旧项目可以只使用 `SUPABASE_SERVICE_ROLE_KEY` 作为兼容方案；两者不需要同时设置。`VITE_SUPABASE_ANON_KEY` 仅供 smoke test 创建临时登录会话，不是服务端密钥。

## 初始化

安装 Supabase CLI 后，在仓库根目录执行：

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

部署后在 Supabase 控制台确认 Bucket 为私有、所有迁移已应用、六个函数均存在且 JWT verification 已启用。不要用浏览器公开密钥测试服务端写权限。

## 生产发布顺序

涉及数据库、函数与前端的版本必须保持向后兼容并按以下顺序发布：

1. 在允许的临时分支完成有边界的改动，通过 PR 审查；不得用用户文件验证线上构建。
2. 在合并前运行根项目、工作流、函数共享测试、六函数 Deno 检查及前端完整验证，确认 `build-pdf-api.yml` 仍只有必填 `job_id`。
3. 合并已验证 PR。若前端依赖新数据库或函数行为，使用分阶段发布：先合并并部署兼容的迁移/函数，通过后端验证和 smoke 后再合并前端。
4. 执行 `supabase db push`，检查远端 migration list 和数据库约束；迁移必须先于依赖它的函数。
5. 部署全部六个 Edge Functions，避免共享模块或函数清单出现版本漂移。
6. 先验证函数：未登录请求被拒绝、允许来源的 CORS preflight 正常、越权任务返回 404、非法状态返回冲突、取消写入 `cancelled`。
7. 在 GitHub Actions 手动运行 `smoke-supabase-service.yml`，确认创建、上传、幂等启动、唯一工作流调度、状态推进、PDF 文件头、签名下载和清理。不要在输出中记录签名 URL。
8. smoke 通过后，在 GitHub Actions 手动运行 `deploy-pages.yml`，确认生产地址可达、桌面/移动截图通过，页面以 Realtime 更新且轮询可兜底。
9. 观察构建与清理工作流，确认成功任务上传输出后才删输入，失败任务进入 `failed`，活动任务没有被清理。

`smoke-supabase-service.yml` 与 `deploy-pages.yml` 都只允许 `workflow_dispatch`；合并或推送 `main` 不会自动运行。单个 PR 同时包含后端与依赖它的前端时，应拆分为两个向后兼容 PR。若改动本身不依赖发布先后，仍要保证新旧前端与新旧后端可以短暂交叉运行；未经合并和验证的提交不能直接部署。

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

六个 Edge Functions：

```bash
npm run check:functions
```

前端：

```bash
cd frontend
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

部署目标已正确配置后再运行：

```bash
cd frontend
npm run smoke:cors
npm run smoke:supabase
```

Smoke test 使用临时用户和受控测试内容，验证上传、真实取消、幂等启动、工作流调度、生命周期、PDF 文件头、签名下载与清理。诊断 Artifact 只短期保留且不得包含服务端密钥、用户内容或签名 URL。

## 清理与保留

- 构建成功后，Actions 尝试删除 `input.md` 与 `assets.zip`；
- 用户取消未启动任务后，函数立即尝试删除输入；清理失败时保留对象路径供后续重试；
- 每日工作流先筛选到期且未收藏的安全终态，再用 `id + 当前状态 + expires_at + is_favorite=false` 原子抢占为 `expired`；
- `queued`、`building`、`uploading` 永不作为清理候选；
- 已是 `expired` 但仍有路径的记录会重试删除；删除成功后清空三个对象路径；
- 单个任务清理失败不阻塞后续任务，日志只记录任务 ID 与清洗后的错误摘要；
- 收藏任务免于自动清理；取消收藏由服务端重算 `expires_at`，清理过程再次检查收藏状态以避免竞态。

## 回滚

数据库迁移采用前向修复，不执行生产 `db reset`，不删除已应用迁移，也不通过破坏性降级移除状态或数据。

1. 发现异常后先停止后续发布；如果后端尚未验证，不继续部署 Pages。
2. 前端问题优先回滚到上一已验证 Pages deployment，或通过 PR revert 后重新部署。该操作不改变 Supabase 数据和任务状态。
3. Edge Function 问题从上一已验证 commit 重新部署受影响函数；共享模块变化时重新部署全部六个。保持已应用的兼容迁移不动。
4. 数据库问题新增一条经过审查的修复迁移。需要停用新行为时，先让前端与函数停止写入，再通过前向迁移修复约束或数据。
5. 工作流或渲染器问题通过 PR revert，完成根项目与工作流验证后合并；不要通过提交用户文档来试跑。
6. 每一步回滚后重新验证所有权、CORS、状态单向推进、唯一 workflow dispatch、私有下载和活动任务免清理，再恢复发布。

若迁移已成功但函数部署失败，保留兼容迁移并重新部署上一版函数；若函数已成功但 Pages 失败，后端保持运行并回滚前端即可。不要把 `cancelled` 数据改写成 `failed` 来兼容旧 UI。

## 常见错误

- `401`：前端会话失效或 JWT verification 配置错误；
- 上传被 RLS 拒绝：检查迁移、任务所有权、`created` 状态、Bucket 和对象路径；
- 取消返回 `409`：任务已进入队列、已过期或并发状态已经变化；
- workflow dispatch 返回 `404`：确认工作流在默认分支存在，并检查 Token 仓库范围；
- workflow dispatch 权限错误：检查 Fine-grained token 的 Actions 写权限；
- Actions 下载对象失败：确认 `input.md` 已上传、任务已到 `queued` 且 Bucket 配置一致；
- 状态不变化：检查 Actions 的 Supabase 服务端 Secret 与数据库状态约束；
- Realtime 无事件：确认迁移已加入 publication；轮询仍应作为兜底；
- 收藏或清理冲突：重新读取任务，以服务端返回的 `is_favorite`、`expires_at` 与 `status` 为准。

Cloudflare 的部署变量、Auth 回调、生产验证和前端回滚见 [Cloudflare Pages 部署文档](cloudflare-pages-actions-deploy.md)。

# 使用 GitHub Actions 部署 Cloudflare Pages

生产前端采用 Cloudflare Pages Direct Upload，不使用 Cloudflare Git Integration。Cloudflare 只托管 `frontend/dist` 中的静态文件，不接收 Markdown、资源 ZIP、PDF，不运行 Edge Functions，也不持有 Supabase 服务端密钥。

部署由 [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) 完成：

```text
已验证的前端相关改动合并到 main
→ GitHub Actions 按路径自动触发
→ 安装锁定的前端依赖
→ TypeScript 检查、测试、Vite 构建
→ 创建或复用 md-to-pdf-web Pages 项目
→ Wrangler Direct Upload frontend/dist
→ 等待生产地址可访问
→ 使用临时测试账号捕获桌面/移动 UI 截图
→ 删除临时账号并发布部署状态
```

工作流仍保留 `workflow_dispatch`，用于重新发布当前 `main`、故障恢复和人工验证。因此无需在 Pages 控制台配置框架、根目录、构建命令或输出目录，也不要把 GitHub 仓库导入 Cloudflare。

## 自动触发范围

只有推送到 `main` 且至少修改下列路径之一时才会自动部署：

```text
frontend/**
scripts/capture-deployed-ui.mjs
scripts/manage-ui-capture-user.mjs
.github/workflows/deploy-pages.yml
```

后端、数据库、渲染器或纯文档改动不会触发 Pages。相同生产环境使用固定 concurrency group；新部署开始时会取消仍在运行的旧部署，避免较旧版本最后覆盖生产环境。

## 发布前置条件

Pages 前端依赖的数据库迁移与六个 Edge Functions 必须先上线并验证：

```text
数据库迁移
→ create-pdf-job / start-pdf-job / cancel-pdf-job
→ get-pdf-download / favorite-pdf-job / rebuild-pdf-job
→ 验证 CORS、鉴权与状态约束
→ 手动运行 Supabase smoke workflow
→ 合并依赖这些能力的前端 PR
→ 自动运行 Pages 前端部署 workflow
```

如果前端需要新的后端行为，应拆成向后兼容的分阶段 PR：先合并并部署后端，完成函数验证和手动 smoke，再合并前端。自动部署只缩短前端发布步骤，不替代后端发布顺序与审查。

## GitHub Actions Repository Secrets

在仓库 `Settings → Secrets and variables → Actions → Repository secrets` 配置：

| Secret | 用途 | 是否进入浏览器包 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Wrangler 创建项目和上传 deployment | 否 |
| `CLOUDFLARE_ACCOUNT_ID` | 指定 Pages 所属账户 | 否 |
| `VITE_SUPABASE_URL` | 浏览器连接 Supabase 项目 | 是 |
| `VITE_SUPABASE_ANON_KEY` | 浏览器公开 Publishable / anon key | 是 |
| `SUPABASE_SECRET_KEY` | GitHub runner 创建并删除临时 UI 截图用户 | 否 |

旧项目可以只提供 `SUPABASE_SERVICE_ROLE_KEY` 代替 `SUPABASE_SECRET_KEY`。该服务端密钥仅用于部署后的已认证 UI 验证，不得传给 Vite、Wrangler 或 Cloudflare Pages。

### Cloudflare API Token

在 Cloudflare `My Profile → API Tokens → Create Token → Custom token` 创建，仅授予：

```text
Account → Cloudflare Pages → Edit
```

Account Resources 只选择实际部署使用的账户。不要授予 DNS、Workers 或其他无关权限。

### Cloudflare Account ID

从 Cloudflare 控制台账户首页或 Workers & Pages 概览复制 Account ID，不要填写 Zone ID。

### Supabase 浏览器变量

`VITE_SUPABASE_URL` 示例：

```text
https://YOUR_PROJECT_REF.supabase.co
```

`VITE_SUPABASE_ANON_KEY` 使用 Supabase Publishable Key（`sb_publishable_...`）或旧版 anon key。它会进入浏览器，实际访问权限由 Auth、RLS、Storage Policy 和 Edge Functions 的所有权检查控制。

绝不能创建以下前端变量：

```text
VITE_SUPABASE_SECRET_KEY
VITE_SUPABASE_SERVICE_ROLE_KEY
VITE_GITHUB_TOKEN
```

## Pages 项目

工作流使用固定项目名：

```text
md-to-pdf-web
```

首次成功运行会执行等价于：

```bash
npx wrangler pages project create md-to-pdf-web --production-branch main
```

之后将 `frontend/dist` 作为 `main` production deployment 上传。默认地址通常为：

```text
https://md-to-pdf-web.pages.dev
```

若项目名称需要调整，必须同步修改工作流中的 `CLOUDFLARE_PAGES_PROJECT`、Supabase Auth URL、生产监控和文档，不能只在控制台重命名。

## 手动重新部署

在 GitHub Actions 页面选择 `Deploy frontend to Cloudflare Pages` 并运行 `workflow_dispatch`。手动运行适用于：

- 自动运行因临时网络或平台故障失败；
- 需要重新验证当前 `main` 的生产截图；
- 回滚或修复后需要立即重新发布；
- 生产 Pages 项目首次初始化。

手动触发前仍应确认所选 ref 是已审查的 `main`，并确认它依赖的数据库迁移和 Edge Functions 已经部署。

## Supabase Auth 回调地址

首次部署成功后，将实际生产域名写入 Supabase：

```text
Authentication → URL Configuration
Site URL: https://md-to-pdf-web.pages.dev
Redirect URLs: https://md-to-pdf-web.pages.dev/**
```

本地开发可继续保留：

```text
http://localhost:5173/**
```

启用自定义域名时，把精确的 HTTPS 域名加入 Redirect URLs；迁移流量前同时保留旧域名，验证登录与深链恢复后再移除旧回调。

## 本地发布前验证

```bash
cd frontend
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

确认 `frontend/dist/index.html` 存在，但不要提交 `dist/`、截图、测试报告或日志。检查构建环境只有 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 两个前端变量。

## 生产验证

部署工作流成功不等于整个 PDF 服务已验证。发布完成后确认：

1. Pages production deployment 指向预期的 `main` commit，首页与登录深链可访问；
2. 桌面和移动截图生成成功，临时测试用户已删除；截图 Artifact 只短期保留且不包含用户文件或密钥；
3. 登录后只能看到当前用户任务，切换账号不会显示上一账号缓存；
4. 创建任务会先上传源文件，只有用户点击生成后才进入构建队列；
5. 取消待启动任务会进入真实 `cancelled`，重复启动不会产生并行构建；
6. 前端状态以 Realtime 更新，断开 Realtime 时轮询能够兜底；
7. 完成任务通过短期签名 URL 下载，自动下载失败不会改变服务端 `completed`；
8. 浏览器网络与静态资源中不存在 `SUPABASE_SECRET_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 或 `GITHUB_TOKEN`；
9. Cloudflare 没有接收或代理任何用户 Markdown、ZIP 与 PDF。

受控端到端验证应使用 `fixtures/` 或 smoke 脚本创建的临时内容，不得把用户文档提交到仓库。

## 回滚

前端回滚与 Supabase、GitHub Actions 相互独立：

1. 在 Cloudflare Pages deployment 历史中选择上一已验证 production deployment 回滚，或通过 PR revert 前端 commit；revert 合并到 `main` 后会自动重新发布；
2. 确认生产域名指向回滚版本，登录回调、任务列表、状态展示和签名下载仍正常；
3. 不要因为前端回滚而重置数据库或删除迁移。兼容的迁移和 Edge Functions 可以继续运行；
4. 如果问题来自 API 契约，先回滚前端对新行为的依赖，再从已验证 commit 重新部署函数；数据库通过新的前向迁移修复；
5. 记录失败 deployment、回滚目标 commit、验证结果与后续修复 PR，但不要记录密钥、签名 URL 或用户内容。

回滚后不得把服务端已完成任务改为失败。若某次自动下载没有发生，用户仍可从已完成任务重新请求签名下载。

Supabase 的完整发布、smoke test 与数据库回滚策略见 [Supabase 服务文档](supabase-pdf-service.md)。

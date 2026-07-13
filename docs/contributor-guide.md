# 贡献指南

## 架构不变量

所有改动都必须保持唯一生产路径：

```text
网站 → Supabase Edge Functions → build-pdf-api.yml(job_id) → Supabase 私有 Storage
```

- Cloudflare Pages 只托管静态前端；
- 网站任务不能由提交 Markdown、ZIP、图片、manifest 或其他仓库文件触发；
- 用户输入、PDF、签名 URL、运行状态与服务端密钥不得进入仓库、PR 或长期 Artifact；
- `start-pdf-job` 只能触发 `build-pdf-api.yml`，且工作流只接受必填 `job_id`；
- 前端只能使用 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`；
- Auth、RLS、CORS、Storage 路径、任务所有权、状态转换和签名下载必须在服务端执行。

任务成功路径是 `created → uploaded → queued → building → uploading → completed`。失败进入 `failed`；未启动的 `created` / `uploaded` 才能进入真实 `cancelled`；安全终态在保留期后可进入 `expired`。不要用 `failed` 模拟取消，也不要让前端本地状态代替数据库状态。

## 分支与 Pull Request

涉及源码、主题、工作流、依赖、数据库、Edge Functions、README 或 `docs/**` 的改动，应使用 `agent/*`、`feature/*`、`fix/*`、`style/*`、`docs/*` 或 `test/*` 分支，通过有边界的 commit 和 Pull Request 合并到 `main`。

PR 必须说明：

- 用户或维护者问题、改动范围和架构影响；
- 已运行的命令及可核对的结果；
- 数据库、鉴权、RLS、CORS、Storage 和工作流安全影响；
- 六个 Edge Functions 中哪些需要部署；
- 迁移、函数、前端的发布顺序；
- 已知限制、监控信号和回滚方式。

不要为了通过 CI 删除、跳过或降低测试。不要把用户文档提交到临时分支来试跑线上构建；渲染回归使用 `fixtures/`，临时内容使用 `.tmp/`。

<!-- ci:repository-validation -->
## 验证矩阵

按改动范围运行所有适用检查；多个范围同时变化时取并集。

| 改动范围 | 最低验证 |
| --- | --- |
| README / `docs/**` / 仓库结构 | `npm run validate:repository`、`npm run test:repository`，并扫描过期架构引用 |
| 渲染器、主题、根依赖 | 根目录 `npm ci`、`npm test`、`npm run validate:workflows`、`npm run test:workflows` |
| GitHub Actions | `npm run validate:workflows`、`npm run test:workflows`、针对修改工作流的静态检查 |
| 前端 | `frontend` 中 `npm ci`、`npm run typecheck`、`npm test`、`npm run build` |
| Edge Functions / 共享模块 | `npm run test:functions`、六个函数的 `deno check`、CORS smoke |
| 数据库迁移、RLS、Storage、生命周期 | 上述函数检查、迁移审阅、远端 migration list、受控 Supabase smoke |
| 清理与分支卫生 | 对应 Node 测试，先 dry-run，再执行写操作 |

仓库级命令：

```bash
npm ci --prefer-offline --no-audit --no-fund
npm run validate:repository
npm run test:repository
npm run validate:workflows
npm run test:workflows
```

`validate:repository` 检查必需文件、本地文档链接、禁止跟踪的生成文件和前端架构清单。

前端命令：

```bash
cd frontend
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

Edge Functions 命令：

```bash
npm run test:functions
npm run check:functions
```

六个函数清单必须与 `supabase/config.toml`、`supabase/functions/` 和 [`.github/workflows/validate-functions.yml`](../.github/workflows/validate-functions.yml) 一致。

## 发布顺序

完成本地验证与 PR 审查后：

1. 合并已验证的 PR；
2. 先应用向后兼容的数据库迁移；
3. 部署全部受影响的 Edge Functions，共享模块变化时部署全部六个；
4. 验证 JWT、CORS、所有权、真实 `cancelled`、状态单向推进和唯一 workflow dispatch；
5. 在 GitHub Actions 手动运行 `Smoke test Supabase PDF service`，观察构建、下载和过期清理；
6. smoke 通过后，手动运行 `Deploy frontend to Cloudflare Pages` 并验证生产前端；
7. 完成后 dry-run 审计已合并临时分支，再执行清理。

两个生产工作流都只允许 `workflow_dispatch`；合并或推送 `main` 不会自动运行。依赖新后端行为的前端使用分阶段 PR：先发布兼容后端并通过手动 smoke，再合并和手动部署前端。生产迁移只做前向修复；不要用 `db reset` 或删除已应用迁移回滚。详细操作见 [Supabase 服务文档](supabase-pdf-service.md) 与 [Pages 部署文档](cloudflare-pages-actions-deploy.md)。

<!-- ci:never-commit-generated-outputs -->
## 禁止提交生成物

`node_modules/`、`dist/`、`.tmp/`、`work/`、覆盖率文件、测试报告、UI 截图、PDF、HTML 和运行日志只能作为本地或短期 CI 产物，并应由 `.gitignore` 排除。

用户上传的 Markdown、ZIP、图片和生成的 PDF 不得写入仓库、commit、Pull Request 或长期 Artifact。与产品无关的外部工具包、设计资料库和技能数据集也不得复制进仓库；使用文档链接或独立仓库维护。

## 临时分支卫生

PR 合并后应删除已合并且不再使用的临时分支。自动清理必须同时满足：

- 分支来自当前仓库；
- 对应 PR 已合并；
- 分支名称符合清理脚本允许的临时前缀；
- `main`、`master`、`output`、`gh-pages` 等受保护分支永不删除；
- 先运行 dry-run 并保留可审计日志。

本地验证分支清理逻辑：

```bash
npm run test:cleanup-branches
```

手动运行 GitHub Actions 清理时先选择 `dry_run=true`，核对候选均来自已合并的同仓库 PR，再执行实际删除。

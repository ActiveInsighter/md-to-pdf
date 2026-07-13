# Contributor Guide

## Repository validation

修改代码、工作流、Supabase Functions、前端依赖或文档后，必须运行与改动范围对应的校验。前端改动至少执行：

```bash
cd frontend
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

仓库级改动还应执行：

```bash
npm run validate:repository
npm run test:repository
npm run test:workflows
npm run validate:workflows
npm run validate:generated-files
```

不得删除、跳过或降低测试来使检查通过。所有失败都应根据真实日志修复。

## Never commit generated outputs

Never commit generated outputs。`node_modules/`、`dist/`、`.tmp/`、`work/`、覆盖率文件、测试报告、截图诊断、PDF、HTML 和运行日志只能作为本地或短期 CI 产物，并应由 `.gitignore` 排除。

用户上传的 Markdown、ZIP、图片和生成的 PDF 不得写入仓库、提交、Pull Request 或长期 Artifact。

## Pull requests

所有源码修改应在 `agent/*`、`feature/*`、`fix/*`、`style/*`、`docs/*` 或 `test/*` 分支完成，通过 Pull Request 合并到 `main`。PR 应说明：

- 改动范围和架构影响；
- 已运行的测试与构建命令；
- 数据库、权限、Storage 和工作流安全影响；
- 已知问题与回滚方式。

## Temporary branch hygiene

PR 合并后应删除已合并的临时分支。不得删除 `main`、`master`、`output` 或 `gh-pages` 等受保护分支。自动清理只能处理同仓库、已合并且符合允许前缀的分支，并应保留审计日志。

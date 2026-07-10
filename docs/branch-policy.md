# 分支结构与提交规则

本仓库长期只保留：

```text
main
output
```

## main

`main` 保存项目源码、构建队列和运行状态：

- GitHub Actions 工作流；
- Node 构建脚本；
- CSS、主题、测试样例与文档；
- 临时进入队列的 `inbox/YYYY/MM/YYYY-MM-DD/` 任务；
- `.github/latest-run.json` 等运行状态文件。

构建成功后，临时 `inbox` 日期目录默认会被消费删除。

## output

`output` 只长期保存生成的 PDF、HTML、预览图、质量报告、日志和产物索引。不要在 `output` 上修改源码。

## 纯导出任务的 main 快速路径

只新增一个完整的 `inbox/**` 任务，且不修改任何源码、主题、工作流或文档时，允许直接向 `main` 提交一次原子队列提交。

要求：

1. 所有任务文件必须在提交前准备完成；
2. 一个任务只产生一个提交；
3. 使用非强制引用更新，禁止 `force`；
4. 目标日期目录已有未消费任务时禁止覆盖；
5. `main` 移动后最多基于最新提交重建一次；
6. 分支保护、并发冲突或第二次更新失败时，回退到 `export/*` 分支与 PR。

纯导出提交信息建议：

```text
export: <文档标题>
```

## 必须使用临时分支的情况

以下修改必须通过 PR：

```text
feature/*
fix/*
style/*
docs/*
test/*
chore/*
patch/*
export/*
```

包括：

- 项目源码、依赖或工作流；
- 主题、样式或页脚；
- README 与 `docs/**`；
- 测试和回归样例；
- 纯导出快速路径失败后的回退任务；
- 同时包含项目修改和 `inbox` 内容的提交。

项目修改与临时导出任务应拆成不同 PR，避免一个 PR 同时触发渲染回归和正式队列构建。

## 自动删除策略

`.github/workflows/cleanup-branches.yml` 在 PR 合并后：

1. 确认 PR 已合并；
2. 确认 head branch 属于当前仓库；
3. 跳过 `main`、`master`、`output`、`gh-pages`；
4. 只删除符合临时分支命名规则的分支。

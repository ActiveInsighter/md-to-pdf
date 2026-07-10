# 高效 Markdown 转 PDF 提示词

下面的提示词用于让 AI 通过 `ActiveInsighter/md-to-pdf` 仓库生成 PDF。使用时只需替换“任务内容”部分。

## 推荐提示词

```text
请使用 GitHub 仓库 ActiveInsighter/md-to-pdf，把下面内容整理为 Markdown，并通过该项目的正式队列导出 PDF。

【任务内容】
<在这里写主题、原始内容、文件列表、合并顺序和具体要求>

【内容要求】
1. 内容准确完整，结构清楚，不为了展示格式而加入无关内容。
2. 默认使用 chatgpt-light 主题。
3. 数学公式统一使用 \(...\) 和 \[...\]；多行公式使用 aligned。
4. 图片使用本地 PNG/SVG，Markdown 从 md/ 目录以 ../img/... 引用。
5. 文件名兼容 Windows，不使用 \ / : * ? " < > |。

【执行要求】
1. 这是纯导出任务时，按仓库根目录 AGENTS.md 的快速路径执行，不要重复扫描 README、脚本、历史 PR 或整个仓库。
2. 先一次性准备好 manifest、Markdown 和图片，再用一个原子 Git 提交写入 main；不要分文件多次提交，不要创建占位内容。
3. 仅当直接更新 main 被分支保护拒绝、main 发生冲突或目标日期目录已有未消费任务时，才回退到 export/* 分支与 PR。
4. 提交后记录导出提交 SHA，只轮询 .github/latest-run.json；不要通过搜索提交记录判断构建状态。
5. latest-run.json 的 head_sha 必须与本次导出提交一致，且状态为 success，才能继续下载产物。
6. 成功后读取 .github/latest-output.json，通过对应 run_id 下载一次 obsidian-style-pdf Artifact，并按索引提取文件。
7. 使用质量报告和单张合成预览图验收；不要重新生成全部页面预览。
8. 构建失败时才读取完整日志，并只修复日志明确指出的问题。

【最终交付】
直接提供 PDF 和 Markdown 源文件；有必要时补充合成预览图。说明 PDF 页数、主题和质量状态。除非我明确要求，不要把 Artifact ZIP 作为主要结果。
```

## 多文件合并时补充

```text
按以下顺序合并：
1. <第一个文件>
2. <第二个文件>
3. <第三个文件>

文件使用 001-、002-、003- 前缀控制顺序，manifest 使用 inputs: all、sort: filename 和 page_break: true。
```

## 只生成单篇 PDF 时补充

```text
只生成一个 PDF，不拆分多个输出。manifest 使用 type: merge，并显式列出唯一 Markdown 输入文件。
```

## 修改项目本身时补充

若任务不是纯导出，而是修改渲染器、主题、页脚、工作流或校验逻辑，追加：

```text
本次涉及项目代码或样式修改，不使用直接提交 main 的导出快速路径。创建对应的 fix/*、style/* 或 feature/* 分支，完成修改与测试后创建 PR，合并后检查渲染回归日志。不要把测试用 inbox 任务和项目源码修改混在同一个提交中。
```

# 使用 GitHub Actions 自动部署 Cloudflare Pages

前端采用 Cloudflare Pages Direct Upload，不使用 Cloudflare Git Integration。构建和部署全部由 `.github/workflows/deploy-pages.yml` 完成。

```text
push main（frontend/ 有变化）
→ GitHub Actions 安装依赖
→ TypeScript 检查
→ Vite 构建 frontend/dist
→ 检查 md-to-pdf-web Pages 项目是否存在
→ 首次运行自动创建项目
→ Wrangler 上传到 Cloudflare Pages
```

因此不需要在 Cloudflare Pages 控制台配置框架、根目录、构建命令或输出目录，也不需要把 GitHub 仓库导入 Cloudflare。

## GitHub Actions Repository Secrets

在仓库 `Settings → Secrets and variables → Actions → Repository secrets` 添加：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

### CLOUDFLARE_API_TOKEN

在 Cloudflare `My Profile → API Tokens → Create Token → Custom token` 创建。

权限：

```text
Account → Cloudflare Pages → Edit
```

Account Resources 只选择实际部署使用的 Cloudflare 账户。

### CLOUDFLARE_ACCOUNT_ID

在 Cloudflare 控制台账户首页或 Workers & Pages 概览中复制 Account ID。不要填写 Zone ID。

### VITE_SUPABASE_URL

填写 Supabase 项目 URL：

```text
https://YOUR_PROJECT_REF.supabase.co
```

### VITE_SUPABASE_ANON_KEY

填写 Supabase Publishable Key（`sb_publishable_...`）或旧版 anon key。该值会进入浏览器，真正的数据访问由 Auth 和 RLS 限制。

绝对不要在前端构建变量中加入：

```text
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
GITHUB_TOKEN
```

## Pages 项目

工作流使用固定项目名：

```text
md-to-pdf-web
```

首次成功运行时会自动执行等价于：

```bash
npx wrangler pages project create md-to-pdf-web --production-branch main
```

之后将 `frontend/dist` 部署到该项目。默认地址通常为：

```text
https://md-to-pdf-web.pages.dev
```

如果该名称已被当前账户中的其他项目占用，请同时修改工作流中的 `CLOUDFLARE_PAGES_PROJECT`。

## 触发方式

生产部署在以下情况触发：

- `main` 分支中的 `frontend/**` 发生变化；
- 部署工作流本身发生变化；
- 在 GitHub Actions 页面手动运行 `Deploy frontend to Cloudflare Pages`。

## Supabase Auth 回调地址

第一次部署成功后，把实际 Pages 地址写入 Supabase：

```text
Authentication → URL Configuration
Site URL: https://md-to-pdf-web.pages.dev
Redirect URLs: https://md-to-pdf-web.pages.dev/**
```

本地开发可继续保留：

```text
http://localhost:5173/**
```

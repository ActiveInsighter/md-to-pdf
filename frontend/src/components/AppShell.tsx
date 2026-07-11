import type { ReactNode } from 'react'

type Props = {
  authenticated: boolean
  children: ReactNode
  onSignOut?: () => void
}

const assurances = [
  ['私有存储', '源文件仅进入 Supabase Storage'],
  ['隔离构建', 'GitHub Actions 异步生成 PDF'],
  ['安全下载', '使用短期签名链接交付'],
]

export function AppShell({ authenticated, children, onSignOut }: Props) {
  return (
    <div className="app-shell">
      <div className="ambient ambient-primary" aria-hidden="true" />
      <div className="ambient ambient-secondary" aria-hidden="true" />

      <main className="page">
        <header className="app-header glass-panel">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">MD</div>
            <div>
              <p className="eyebrow">PRIVATE PDF WORKSPACE</p>
              <h1>Markdown 转 PDF</h1>
              <p className="hero-copy">
                {authenticated
                  ? '上传 Markdown，在隔离任务中生成排版稳定的 PDF。'
                  : '登录后使用私有存储与异步构建服务。'}
              </p>
            </div>
          </div>

          {authenticated ? (
            <button className="ghost-button" type="button" onClick={onSignOut}>退出登录</button>
          ) : (
            <span className="status-pill"><span aria-hidden="true" />安全登录</span>
          )}
        </header>

        <section className="assurance-bar glass-panel" aria-label="服务特性">
          {assurances.map(([title, description]) => (
            <div className="assurance-item" key={title}>
              <span className="assurance-dot" aria-hidden="true" />
              <div>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
            </div>
          ))}
        </section>

        {children}

        <footer className="site-footer">
          <span>md-to-pdf</span>
          <span>Supabase · GitHub Actions · Cloudflare Pages</span>
        </footer>
      </main>
    </div>
  )
}

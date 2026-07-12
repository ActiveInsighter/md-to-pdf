import type { ReactNode } from 'react'

type Props = {
  authenticated: boolean
  children: ReactNode
  onSignOut?: () => void
}

export function AppShell({ authenticated, children, onSignOut }: Props) {
  return (
    <div className="app-shell" id="top">
      <header className="app-header">
        <a className="brand-lockup" href="#top" aria-label="返回页面顶部">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span className="brand-copy">
            <strong>Markdown to PDF</strong>
            <span>简洁、稳定的 PDF 构建工具</span>
          </span>
        </a>
        {authenticated ? (
          <button className="ghost-button" type="button" onClick={onSignOut}>退出</button>
        ) : (
          <span className="header-note">私有存储 · 自动交付</span>
        )}
      </header>

      <main className="page">{children}</main>

      <footer className="site-footer">
        <span>md-to-pdf</span>
        <span>Supabase · GitHub Actions · Cloudflare Pages</span>
      </footer>
    </div>
  )
}

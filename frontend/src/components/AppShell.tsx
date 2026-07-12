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
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M8.5 5.5h10l5 5v16h-15v-21Z" />
              <path d="M18.5 5.5v5h5" />
              <path d="M12 16h8M12 20h6" />
            </svg>
          </span>
          <span className="brand-copy">
            <span className="brand-title">Markdown 转 PDF</span>
            <span className="brand-subtitle">简洁、可追踪、自动下载</span>
          </span>
        </a>

        {authenticated ? (
          <button className="ghost-button" type="button" onClick={onSignOut}>退出</button>
        ) : (
          <span className="status-pill"><span aria-hidden="true" />安全登录</span>
        )}
      </header>

      <main className="page">{children}</main>
    </div>
  )
}

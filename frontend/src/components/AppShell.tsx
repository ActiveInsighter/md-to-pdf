import type { ReactNode } from 'react'

type Props = {
  authenticated: boolean
  children: ReactNode
  onSignOut?: () => void
}

function BrandIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8.5 5.5h10l5 5v16h-15v-21Z" />
      <path d="M18.5 5.5v5h5" />
      <path d="M12 16h8M12 20h6" />
    </svg>
  )
}

export function AppShell({ authenticated, children, onSignOut }: Props) {
  return (
    <div className="app-shell" id="top">
      <header className="app-header">
        <a className="brand-lockup" href="#top" aria-label="返回页面顶部">
          <span className="brand-mark"><BrandIcon /></span>
          <span className="brand-copy">
            <span className="brand-title">Markdown PDF</span>
            <span className="brand-subtitle">Build workspace</span>
          </span>
        </a>

        <div className="header-actions">
          {authenticated ? (
            <>
              <a className="header-link" href="#workspace">创建任务</a>
              <a className="header-link" href="#history">任务记录</a>
              <button className="ghost-button" type="button" onClick={onSignOut}>退出登录</button>
            </>
          ) : (
            <span className="status-pill"><span aria-hidden="true" />安全连接</span>
          )}
        </div>
      </header>

      <main className="page">{children}</main>
    </div>
  )
}

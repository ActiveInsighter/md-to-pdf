import type { ReactNode } from 'react'

type Props = {
  authenticated: boolean
  children: ReactNode
  onSignOut?: () => void
}

type AssuranceIcon = 'lock' | 'spark' | 'link'

const assurances: Array<{ title: string; description: string; icon: AssuranceIcon }> = [
  { title: '私有存储', description: '源文件只进入 Supabase 私有桶', icon: 'lock' },
  { title: '隔离构建', description: 'GitHub Actions 异步生成 PDF', icon: 'spark' },
  { title: '安全下载', description: '短期签名链接完成交付', icon: 'link' },
]

function FeatureIcon({ name }: { name: AssuranceIcon }) {
  if (name === 'lock') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="3" />
        <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        <path d="M12 14v2" />
      </svg>
    )
  }

  if (name === 'spark') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m13 2-1.8 6.2L5 10l6.2 1.8L13 18l1.8-6.2L21 10l-6.2-1.8L13 2Z" />
        <path d="m5 15-.8 2.2L2 18l2.2.8L5 21l.8-2.2L8 18l-2.2-.8L5 15Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 14.5 14.5 9" />
      <path d="M7.5 16.5 5.8 18.2a3.4 3.4 0 0 1-4.8-4.8l3.2-3.2A3.4 3.4 0 0 1 9 10" />
      <path d="m14.9 14 4.9-4.9A3.4 3.4 0 0 0 15 4.3L13.3 6" />
    </svg>
  )
}

export function AppShell({ authenticated, children, onSignOut }: Props) {
  return (
    <div className="app-shell" id="top">
      <div className="liquid-grid" aria-hidden="true" />
      <div className="ambient ambient-primary" aria-hidden="true" />
      <div className="ambient ambient-secondary" aria-hidden="true" />
      <div className="ambient ambient-tertiary" aria-hidden="true" />

      <main className="page">
        <header className="app-header glass-panel">
          <a className="brand-lockup" href="#top" aria-label="返回 Markdown 转 PDF 页面顶部">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M8.5 5.5h10l5 5v16h-15v-21Z" />
                <path d="M18.5 5.5v5h5" />
                <path d="M12 16h8M12 20h6" />
                <path className="brand-spark" d="m7 7-.8 2.2L4 10l2.2.8L7 13l.8-2.2L10 10l-2.2-.8L7 7Z" />
              </svg>
            </span>
            <span className="brand-copy">
              <span className="eyebrow">LIQUID GLASS PDF STUDIO</span>
              <span className="brand-title">Markdown 转 PDF</span>
            </span>
          </a>

          <nav className="app-nav" aria-label="页面导航">
            {authenticated ? (
              <>
                <a href="#workspace">工作区</a>
                <a href="#history">最近任务</a>
              </>
            ) : (
              <>
                <a href="#features">能力</a>
                <a href="#workflow">流程</a>
              </>
            )}
          </nav>

          <div className="header-action">
            {authenticated ? (
              <button className="ghost-button" type="button" onClick={onSignOut}>退出登录</button>
            ) : (
              <span className="status-pill"><span aria-hidden="true" />安全登录</span>
            )}
          </div>
        </header>

        <section className="assurance-bar glass-panel" id="features" aria-label="服务特性">
          {assurances.map(({ title, description, icon }) => (
            <div className="assurance-item" key={title}>
              <span className="assurance-icon" aria-hidden="true"><FeatureIcon name={icon} /></span>
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

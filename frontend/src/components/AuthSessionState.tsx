import type { AuthSessionStatus } from '../types/authSession'

type Props = {
  status: Exclude<AuthSessionStatus, 'ready'>
  error: string
  onRetry: () => void
}

export function AuthSessionState({ status, error, onRetry }: Props) {
  const loading = status === 'loading'

  return (
    <section
      className={`card auth-session-card ${loading ? 'is-loading' : 'is-error'}`}
      role={loading ? 'status' : 'alert'}
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="auth-session-icon" aria-hidden="true">
        {loading ? <span className="auth-session-spinner" /> : '!'}
      </div>
      <p className="eyebrow">SECURE SESSION</p>
      <h2>{loading ? '正在恢复登录状态' : '暂时无法连接认证服务'}</h2>
      <p className="muted">
        {loading
          ? '正在检查本地会话，请稍候。'
          : error || '认证服务暂时不可用，请检查网络后重试。'}
      </p>
      {!loading && (
        <div className="auth-session-actions">
          <button type="button" onClick={onRetry}>重新连接</button>
          <span className="muted">不会清除本地文件或任务记录。</span>
        </div>
      )}
    </section>
  )
}

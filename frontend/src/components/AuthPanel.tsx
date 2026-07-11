import { FormEvent, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type AuthMode = 'signin' | 'signup'

function readableAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Anonymous sign-ins are disabled')) {
    return '请输入有效邮箱和至少 6 位密码后再注册。'
  }
  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码不正确，或者账号尚未完成邮箱确认。'
  }
  if (message.includes('Email not confirmed')) {
    return '邮箱尚未确认，请先打开确认邮件中的链接。'
  }
  if (message.includes('User already registered')) {
    return '该邮箱已经注册，请直接登录。'
  }
  return message || '认证失败，请稍后重试。'
}

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busyMode, setBusyMode] = useState<AuthMode | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const normalizedEmail = email.trim().toLowerCase()
  const canSubmit = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) && password.length >= 6,
    [normalizedEmail, password],
  )
  const feedbackId = error ? 'auth-error' : notice ? 'auth-notice' : undefined

  async function authenticate(mode: AuthMode) {
    setError('')
    setNotice('')

    if (!normalizedEmail) {
      setError('请输入邮箱。')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('邮箱格式不正确。')
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 位。')
      return
    }

    setBusyMode(mode)
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (signInError) throw signInError
        setNotice('登录成功。')
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      })
      if (signUpError) throw signUpError

      if (data.session) {
        setNotice('注册成功，已经自动登录。')
      } else {
        setNotice('注册成功。请检查邮箱并点击确认链接，然后返回此页面登录。')
      }
      setPassword('')
    } catch (cause) {
      setError(readableAuthError(cause))
    } finally {
      setBusyMode(null)
    }
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void authenticate('signin')
  }

  return (
    <section className="card auth-card" aria-labelledby="auth-title">
      <h2 id="auth-title">登录后生成 PDF</h2>
      <p className="muted" id="auth-help">
        使用 Supabase 邮箱密码账号登录。首次使用请先注册。
      </p>
      <form className="stack" onSubmit={submitLogin} noValidate aria-busy={busyMode !== null}>
        <label htmlFor="auth-email">
          邮箱
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            disabled={busyMode !== null}
            aria-describedby={feedbackId || 'auth-help'}
            required
          />
        </label>
        <label htmlFor="auth-password">
          密码
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={6}
            maxLength={72}
            disabled={busyMode !== null}
            aria-describedby={feedbackId || 'auth-help'}
            required
          />
        </label>
        <div className="row">
          <button type="submit" disabled={busyMode !== null || !canSubmit}>
            {busyMode === 'signin' ? '正在登录…' : '登录'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busyMode !== null || !canSubmit}
            onClick={() => void authenticate('signup')}
          >
            {busyMode === 'signup' ? '正在注册…' : '注册'}
          </button>
        </div>
      </form>
      {notice && (
        <p id="auth-notice" className="success-text" role="status" aria-live="polite" aria-atomic="true">
          {notice}
        </p>
      )}
      {error && (
        <p id="auth-error" className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent, mode: 'signin' | 'signup') {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) setNotice('注册成功，请按邮件提示确认账号。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card auth-card">
      <h2>登录后生成 PDF</h2>
      <p className="muted">任务、源文件和 PDF 均按 Supabase 用户隔离。</p>
      <form className="stack">
        <label>邮箱<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
        <div className="row">
          <button disabled={busy} onClick={(e) => void submit(e, 'signin')}>登录</button>
          <button className="secondary" disabled={busy} onClick={(e) => void submit(e, 'signup')}>注册</button>
        </div>
      </form>
      {notice && <p className="success-text">{notice}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { LockKeyhole, Mail } from 'lucide-react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'
import { toast } from 'sonner'
import { authSchema, type AuthFormValues } from '../schemas/authSchema'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'

type AuthMode = 'signin' | 'signup'

function safeDestination(location: Location): string {
  const from = (location.state as { from?: Location } | null)?.from
  if (!from?.pathname?.startsWith('/')) return '/workspace'
  return `${from.pathname}${from.search || ''}${from.hash || ''}`
}

export function AuthForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [notice, setNotice] = useState('')
  const form = useForm<AuthFormValues>({ resolver: zodResolver(authSchema), defaultValues: { email: '', password: '' } })

  const submit = form.handleSubmit(async (values) => {
    setNotice('')
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword(values)
        if (error) throw error
        toast.success('登录成功。')
        navigate(safeDestination(location), { replace: true })
        return
      }

      const { data, error } = await supabase.auth.signUp(values)
      if (error) throw error
      if (data.session) {
        toast.success('注册成功，已经自动登录。')
        navigate(safeDestination(location), { replace: true })
      } else {
        setNotice('注册成功。请检查邮箱并点击确认链接，然后返回登录。')
        form.setValue('password', '')
      }
    } catch (cause) {
      form.setError('root', { message: toUserMessage(cause, '认证失败，请稍后重试。') })
    }
  })

  const emailError = form.formState.errors.email?.message
  const passwordError = form.formState.errors.password?.message
  const busy = form.formState.isSubmitting

  return (
    <Card id="auth-panel" className="w-full max-w-md bg-card/90 shadow-lifted backdrop-blur-xl">
      <CardHeader className="gap-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground"><LockKeyhole className="size-5" /></div>
        <div><CardTitle>{mode === 'signin' ? '登录文档工坊' : '创建工作台账号'}</CardTitle><CardDescription className="mt-1">使用邮箱与密码安全访问你的私有 PDF 任务。</CardDescription></div>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(emailError)} data-disabled={busy}>
              <FieldLabel htmlFor="auth-email">邮箱</FieldLabel>
              <div className="relative"><Mail aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="auth-email" type="email" inputMode="email" autoComplete="email" className="pl-9" placeholder="name@example.com" disabled={busy} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'auth-email-error' : undefined} {...form.register('email')} /></div>
              <FieldError id="auth-email-error">{emailError}</FieldError>
            </Field>
            <Field data-invalid={Boolean(passwordError)} data-disabled={busy}>
              <FieldLabel htmlFor="auth-password">密码</FieldLabel>
              <div className="relative"><LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} className="pl-9" placeholder="至少 6 位" disabled={busy} aria-invalid={Boolean(passwordError)} aria-describedby={passwordError ? 'auth-password-error' : undefined} {...form.register('password')} /></div>
              <FieldError id="auth-password-error">{passwordError}</FieldError>
            </Field>
          </FieldGroup>

          {form.formState.errors.root?.message && <Alert variant="destructive"><AlertDescription>{form.formState.errors.root.message}</AlertDescription></Alert>}
          {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}

          <div className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>{busy && <Spinner data-icon="inline-start" />}{busy ? '请稍候…' : mode === 'signin' ? '登录' : '创建账号'}</Button>
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setMode((current) => current === 'signin' ? 'signup' : 'signin'); form.clearErrors(); setNotice('') }}>
              {mode === 'signin' ? '首次使用？创建账号' : '已有账号？返回登录'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

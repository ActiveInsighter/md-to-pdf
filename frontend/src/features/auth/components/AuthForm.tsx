import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authSchema, type AuthFormValues } from '../schemas/authSchema'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'

type AuthMode = 'signin' | 'signup'

export function AuthForm() {
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
        navigate('/workspace', { replace: true })
        return
      }
      const { data, error } = await supabase.auth.signUp(values)
      if (error) throw error
      if (data.session) {
        toast.success('注册成功，已经自动登录。')
        navigate('/workspace', { replace: true })
      } else {
        setNotice('注册成功。请检查邮箱并点击确认链接，然后返回登录。')
        form.setValue('password', '')
      }
    } catch (cause) {
      form.setError('root', { message: toUserMessage(cause, '认证失败，请稍后重试。') })
    }
  })

  const busy = form.formState.isSubmitting
  return (
    <Card id="auth-panel" className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div>
        <div>
          <CardTitle>{mode === 'signin' ? '登录工作台' : '创建账号'}</CardTitle>
          <CardDescription className="mt-1">使用 Supabase 邮箱密码账号安全访问你的 PDF 任务。</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="auth-email">邮箱</label>
            <div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="auth-email" type="email" autoComplete="email" className="pl-9" placeholder="name@example.com" disabled={busy} {...form.register('email')} /></div>
            {form.formState.errors.email && <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="auth-password">密码</label>
            <div className="relative"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} className="pl-9" placeholder="至少 6 位" disabled={busy} {...form.register('password')} /></div>
            {form.formState.errors.password && <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>}
          </div>
          {form.formState.errors.root?.message && <Alert variant="destructive"><AlertDescription className="auth-message error-text">{form.formState.errors.root.message}</AlertDescription></Alert>}
          {notice && <Alert><AlertDescription className="auth-message">{notice}</AlertDescription></Alert>}
          <Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{mode === 'signin' ? '登录' : '注册'}</Button>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setMode((current) => current === 'signin' ? 'signup' : 'signin'); form.clearErrors(); setNotice('') }}>
            {mode === 'signin' ? '首次使用？创建账号' : '已有账号？返回登录'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

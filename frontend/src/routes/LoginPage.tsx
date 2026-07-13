import { Navigate } from 'react-router-dom'
import { Check, FileOutput, Gauge, PenLine, ShieldCheck, type LucideIcon } from 'lucide-react'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'

const benefits: Array<{ icon: LucideIcon; title: string; copy: string }> = [
  { icon: ShieldCheck, title: '源稿保持私有', copy: '输入与成品只在受控任务空间中流转。' },
  { icon: Gauge, title: '每一步都可见', copy: '从上传、排队到交付，状态与耗时清楚可查。' },
  { icon: FileOutput, title: '成品随时取回', copy: '任务完成后通过短期下载链接安全交付。' },
]

export function LoginPage() {
  const { session, status } = useAuth()
  if (status === 'ready' && session) return <Navigate to="/workspace" replace />

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="paper-rule absolute inset-y-0 left-0 hidden w-[52%] opacity-35 lg:block" />
      <main id="main-content" tabIndex={-1} className="relative mx-auto grid min-h-dvh max-w-[1480px] items-center gap-12 p-4 outline-none sm:p-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)] lg:p-12 xl:gap-20">
        <section aria-labelledby="login-title" className="flex min-w-0 flex-col gap-8 py-8">
          <div className="flex items-center gap-3">
            <div className="relative flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <PenLine className="size-5" />
              <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-background bg-success" />
            </div>
            <div><strong className="block font-display text-lg">Markdown PDF</strong><span className="text-sm text-muted-foreground">Digital typesetting studio</span></div>
          </div>

          <div className="max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-primary">从源稿到成品</span>
            <h1 id="login-title" className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-6xl xl:text-7xl">
              让每一份 Markdown，成为值得交付的 PDF。
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              上传文档或粘贴文本，选择排版主题，然后交给独立构建流程。公式、代码、图片资源与真实进度，都在一个安静清楚的工作台里。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {benefits.map(({ icon: Icon, title, copy }) => (
              <Card key={title} className="bg-card/75 shadow-none backdrop-blur-sm">
                <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
                  <Icon aria-hidden="true" className="size-5 text-primary" />
                  <div><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{copy}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex max-w-2xl items-start gap-3 rounded-xl border bg-card/80 p-4 text-sm shadow-panel">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-muted text-success"><Check className="size-4" /></span>
            <div className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">交付示例</span><code className="mt-1 block break-all font-mono">操作系统第5章.md → 操作系统第5章.pdf</code></div>
          </div>
        </section>

        <aside aria-label="账号登录" className="flex justify-center lg:justify-end">
          <AuthForm />
        </aside>
      </main>
    </div>
  )
}

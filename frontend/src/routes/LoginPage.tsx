import { Navigate } from 'react-router-dom'
import { CheckCircle2, FileOutput, Gauge, ShieldCheck, type LucideIcon } from 'lucide-react'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { useAuth } from '@/features/auth/hooks/useAuth'

const benefits: Array<{ icon: LucideIcon; title: string; copy: string }> = [
  { icon: ShieldCheck, title: '私有上传', copy: '源文件通过 Supabase Storage 管理' },
  { icon: Gauge, title: '真实进度', copy: '同步构建阶段并提供轮询兜底' },
  { icon: FileOutput, title: '灵活交付', copy: '支持手动与自动下载' },
]

export function LoginPage() {
  const { session, status } = useAuth()
  if (status === 'ready' && session) return <Navigate to="/workspace" replace />
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:py-14">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-8">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">MP</div><div><strong className="block">Markdown PDF</strong><span className="text-sm text-muted-foreground">Private build workspace</span></div></div>
          <div className="max-w-2xl"><span className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Markdown PDF Workspace</span><h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">从 Markdown 到 PDF，过程清楚，结果可靠。</h1><p className="mt-5 text-lg leading-8 text-slate-600">上传文档或粘贴文本，选择主题后进入独立构建队列。公式、代码高亮、图片资源和任务进度都在同一个工作台中管理。</p></div>
          <div className="grid gap-4 sm:grid-cols-3">{benefits.map(({ icon: Icon, title, copy }) => <div key={title} className="rounded-lg border bg-white p-4 shadow-panel"><Icon className="h-5 w-5 text-primary" /><strong className="mt-3 block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{copy}</span></div>)}</div>
          <div className="flex items-center gap-3 rounded-lg border bg-white p-4 text-sm shadow-panel"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><code className="break-all">操作系统第5章.md → 操作系统第5章.pdf</code></div>
        </section>
        <AuthForm />
      </div>
    </div>
  )
}

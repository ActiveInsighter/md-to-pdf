import { CircleCheckBig, CircleX, FilePlus2, FileText, Files, Heart, LoaderCircle, LogOut, Settings, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { RealtimeIndicator } from '@/features/pdf-jobs/components/RealtimeIndicator'
import { usePdfJobs } from '@/features/pdf-jobs/hooks/usePdfJobs'
import { isTerminalJob } from '@/features/pdf-jobs/status'

type CountKey = 'all' | 'active' | 'completed' | 'failed' | 'favorite'
type NavigationItem = { label: string; to: string; icon: typeof FilePlus2; count?: CountKey }

const navigation: NavigationItem[] = [
  { label: '创建任务', to: '/workspace', icon: FilePlus2 },
  { label: '全部任务', to: '/jobs', icon: Files, count: 'all' },
  { label: '进行中', to: '/jobs?status=active', icon: LoaderCircle, count: 'active' },
  { label: '已完成', to: '/jobs?status=completed', icon: CircleCheckBig, count: 'completed' },
  { label: '失败', to: '/jobs?status=failed', icon: CircleX, count: 'failed' },
  { label: '收藏', to: '/jobs?status=favorite', icon: Heart, count: 'favorite' },
]

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const jobs = usePdfJobs({ status: 'all', search: '' }).data || []
  const counts = {
    all: jobs.length,
    active: jobs.filter((job) => !isTerminalJob(job)).length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed' || job.status === 'expired' || job.status === 'cancelled').length,
    favorite: jobs.filter((job) => job.is_favorite).length,
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      onNavigate?.()
      navigate('/login', { replace: true })
    } catch (cause) {
      toast.error(toUserMessage(cause, '退出登录失败。'))
    }
  }

  return (
    <aside className="flex h-full flex-col">
      <div className="flex min-h-20 items-center gap-3 px-5">
        <div className="relative flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md"><FileText className="size-5" /><span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card bg-success" /></div>
        <div><strong className="block font-display text-base">Markdown PDF</strong><span className="text-xs text-muted-foreground">数字排版工坊</span></div>
      </div>
      <Separator />

      <nav aria-label="任务导航" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{navigation.map((item) => {
        const active = item.to.includes('?') ? `${location.pathname}${location.search}` === item.to : location.pathname === item.to
        const Icon = item.icon
        return <Link key={item.to} to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', active && 'bg-accent text-accent-foreground')}><Icon className={cn('size-4', item.label === '进行中' && counts.active > 0 && 'animate-spin')} /><span>{item.label}</span>{item.count && <Badge variant="secondary" className="ml-auto min-w-7 justify-center">{counts[item.count]}</Badge>}</Link>
      })}</nav>

      <Separator />
      <div className="space-y-2 p-3">
        <NavLink to="/settings" onClick={onNavigate} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', isActive && 'bg-accent text-accent-foreground')}><Settings className="size-4" />设置</NavLink>
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2"><RealtimeIndicator /><span className="text-xs text-muted-foreground">任务同步</span></div>
        <div className="rounded-xl border bg-card p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><UserRound className="size-4" /></span>
            <div className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">当前账号</span><strong className="block truncate text-sm">{session?.user.email || '已登录用户'}</strong></div>
            <Button type="button" variant="ghost" size="icon" onClick={() => void handleSignOut()} aria-label="退出登录"><LogOut /></Button>
          </div>
        </div>
      </div>
    </aside>
  )
}

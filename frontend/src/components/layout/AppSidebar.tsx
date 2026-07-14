import { CircleCheckBig, CircleX, FilePlus2, FileText, Files, Heart, LoaderCircle, LogOut, Settings, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
  { label: '异常任务', to: '/jobs?status=failed', icon: CircleX, count: 'failed' },
  { label: '收藏', to: '/jobs?status=favorite', icon: Heart, count: 'favorite' },
  { label: '设置', to: '/settings', icon: Settings },
]

function isNavigationActive(pathname: string, search: string, target: string): boolean {
  if (target.includes('?')) return `${pathname}${search}` === target
  if (target === '/jobs') return pathname.startsWith('/jobs') && search.length === 0
  return pathname === target
}

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
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="relative flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <FileText className="size-4.5" />
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-success" />
        </div>
        <div className="min-w-0">
          <strong className="block truncate font-display text-sm font-semibold">Markdown PDF</strong>
          <span className="block truncate text-[11px] text-muted-foreground">文档转换工作台</span>
        </div>
      </div>
      <Separator />

      <nav aria-label="任务导航" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <span className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">工作区</span>
        {navigation.map((item) => {
          const active = isNavigationActive(location.pathname, location.search, item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                active && 'bg-accent text-accent-foreground',
              )}
            >
              <Icon className={cn('size-4', item.label === '进行中' && counts.active > 0 && 'animate-spin')} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count && (
                <Badge variant="secondary" className={cn('h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold', active && 'bg-background/80 text-accent-foreground')}>
                  {counts[item.count]}
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>

      <Separator />
      <div className="space-y-2 p-3">
        <div className="flex h-9 items-center justify-between gap-2 px-2">
          <RealtimeIndicator />
          <span className="text-[11px] text-muted-foreground">实时同步</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/25 p-2">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><UserRound className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] text-muted-foreground">当前账号</span>
            <strong className="block truncate text-xs font-semibold">{session?.user.email || '已登录用户'}</strong>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void handleSignOut()} aria-label="退出登录"><LogOut /></Button>
        </div>
      </div>
    </aside>
  )
}

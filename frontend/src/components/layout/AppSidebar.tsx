import { useMemo } from 'react'
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

const workspaceNavigation: NavigationItem[] = [
  { label: '创建任务', to: '/workspace', icon: FilePlus2 },
  { label: '设置', to: '/settings', icon: Settings },
]

const taskNavigation: NavigationItem[] = [
  { label: '全部任务', to: '/jobs', icon: Files, count: 'all' },
  { label: '进行中', to: '/jobs?status=active', icon: LoaderCircle, count: 'active' },
  { label: '已完成', to: '/jobs?status=completed', icon: CircleCheckBig, count: 'completed' },
  { label: '异常任务', to: '/jobs?status=failed', icon: CircleX, count: 'failed' },
  { label: '收藏', to: '/jobs?status=favorite', icon: Heart, count: 'favorite' },
]

function isNavigationActive(pathname: string, search: string, target: string): boolean {
  const targetUrl = new URL(target, window.location.origin)
  if (pathname !== targetUrl.pathname) return false

  const currentParams = new URLSearchParams(search)
  const targetStatus = targetUrl.searchParams.get('status')
  const currentStatus = currentParams.get('status')

  if (targetUrl.pathname === '/jobs') return targetStatus ? currentStatus === targetStatus : !currentStatus
  return true
}

function SidebarNavigationItem({
  item,
  active,
  count,
  onNavigate,
}: {
  item: NavigationItem
  active: boolean
  count?: number
  onNavigate?: () => void
}) {
  const Icon = item.icon

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-[color,background-color,box-shadow]',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className={cn('size-4', item.label === '进行中' && Boolean(count) && 'animate-spin')} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count && (
        <Badge
          variant="secondary"
          className={cn(
            'h-5 min-w-5 justify-center rounded-full border-0 px-1.5 text-[10px] font-semibold tabular-nums',
            active ? 'bg-background/85 text-sidebar-accent-foreground' : 'bg-sidebar-foreground/5 text-sidebar-foreground/65',
          )}
        >
          {count ?? 0}
        </Badge>
      )}
    </Link>
  )
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const jobs = usePdfJobs({ status: 'all', search: '' }).data
  const counts = useMemo(() => {
    const items = jobs ?? []
    return {
      all: items.length,
      active: items.filter((job) => !isTerminalJob(job)).length,
      completed: items.filter((job) => job.status === 'completed').length,
      failed: items.filter((job) => job.status === 'failed' || job.status === 'expired' || job.status === 'cancelled').length,
      favorite: items.filter((job) => job.is_favorite).length,
    }
  }, [jobs])

  const handleSignOut = async () => {
    try {
      await signOut()
      onNavigate?.()
      navigate('/login', { replace: true })
    } catch (cause) {
      toast.error(toUserMessage(cause, '退出登录失败。'))
    }
  }

  const renderNavigation = (items: NavigationItem[]) => items.map((item) => (
    <SidebarNavigationItem
      key={item.to}
      item={item}
      active={isNavigationActive(location.pathname, location.search, item.to)}
      count={item.count ? counts[item.count] : undefined}
      onNavigate={onNavigate}
    />
  ))

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="relative flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <FileText className="size-[18px]" />
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-success" />
        </div>
        <div className="min-w-0">
          <strong className="block truncate font-display text-sm font-semibold tracking-tight">Markdown PDF</strong>
          <span className="block truncate text-[11px] text-sidebar-foreground/55">文档转换工作台</span>
        </div>
      </div>
      <Separator className="bg-sidebar-border" />

      <nav aria-label="任务导航" className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        <section aria-labelledby="workspace-nav-label">
          <h2 id="workspace-nav-label" className="section-kicker px-2 pb-2 text-sidebar-foreground/50">工作区</h2>
          <div className="space-y-1">{renderNavigation(workspaceNavigation)}</div>
        </section>

        <section aria-labelledby="tasks-nav-label">
          <h2 id="tasks-nav-label" className="section-kicker px-2 pb-2 text-sidebar-foreground/50">任务</h2>
          <div className="space-y-1">{renderNavigation(taskNavigation)}</div>
        </section>
      </nav>

      <Separator className="bg-sidebar-border" />
      <div className="space-y-2 p-3">
        <div className="flex h-9 items-center justify-between gap-2 px-2">
          <RealtimeIndicator />
          <span className="text-[11px] text-sidebar-foreground/55">实时同步</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-sidebar-border bg-background/70 p-2 shadow-sm">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary">
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] text-sidebar-foreground/50">当前账号</span>
            <strong className="block truncate text-xs font-semibold">{session?.user.email || '已登录用户'}</strong>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={() => void handleSignOut()} aria-label="退出登录">
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  )
}

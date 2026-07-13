import { CircleCheckBig, CircleX, FilePlus2, Files, Heart, LoaderCircle, Settings } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
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
  const jobs = usePdfJobs({ status: 'all', search: '' }).data || []
  const counts = {
    all: jobs.length,
    active: jobs.filter((job) => !isTerminalJob(job)).length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed' || job.status === 'expired').length,
    favorite: jobs.filter((job) => job.is_favorite).length,
  }

  return (
    <aside className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center gap-3 px-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">MP</div><div><strong className="block text-sm">Markdown PDF</strong><span className="text-xs text-muted-foreground">构建工作台</span></div></div>
      <Separator />
      <nav className="flex-1 space-y-1 p-3">{navigation.map((item) => {
        const active = item.to.includes('?') ? `${location.pathname}${location.search}` === item.to : location.pathname === item.to
        const Icon = item.icon
        return <NavLink key={item.to} to={item.to} onClick={onNavigate} className={cn('flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground', active && 'bg-primary/10 text-primary')}><Icon className={cn('h-4 w-4', item.label === '进行中' && counts.active > 0 && 'animate-spin')} /><span>{item.label}</span>{item.count && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{counts[item.count]}</span>}</NavLink>
      })}</nav>
      <Separator />
      <div className="p-3"><NavLink to="/settings" onClick={onNavigate} className={({ isActive }) => cn('flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground', isActive && 'bg-primary/10 text-primary')}><Settings className="h-4 w-4" />设置</NavLink></div>
    </aside>
  )
}

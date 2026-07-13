import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RealtimeIndicator } from '@/features/pdf-jobs/components/RealtimeIndicator'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toUserMessage } from '@/lib/errors'
import { MobileNavigation } from './MobileNavigation'

export function AppHeader() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (cause) {
      toast.error(toUserMessage(cause, '退出登录失败。'))
    }
  }
  return (
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <MobileNavigation />
        <div>
          <strong className="block text-sm">文档工坊</strong>
          <span className="hidden text-xs text-muted-foreground sm:block">从源稿到可交付 PDF</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block"><RealtimeIndicator /></div>
        <div className="hidden items-center gap-3 rounded-full border bg-card/70 py-1.5 pl-1.5 pr-3 text-sm text-muted-foreground md:flex">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold uppercase text-primary-foreground">
            {session?.user.email?.slice(0, 1) || 'U'}
          </span>
          <span className="max-w-48 truncate">{session?.user.email}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void handleSignOut()} aria-label="退出登录">
          <LogOut data-icon="inline-start" />
        </Button>
      </div>
    </header>
  )
}

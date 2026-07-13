import { LogOut, UserRound } from 'lucide-react'
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
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3"><MobileNavigation /><div><strong className="block text-sm">PDF 工作台</strong><span className="hidden text-xs text-muted-foreground sm:block">可靠地上传、构建和交付文档</span></div></div>
      <div className="flex items-center gap-2"><div className="hidden sm:block"><RealtimeIndicator /></div><div className="hidden items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground md:flex"><UserRound className="h-4 w-4" /><span className="max-w-48 truncate">{session?.user.email}</span></div><Button variant="ghost" size="icon" onClick={() => void handleSignOut()} aria-label="退出登录"><LogOut className="h-4 w-4" /></Button></div>
    </header>
  )
}

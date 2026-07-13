import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { RouteLoading } from './RouteLoading'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PdfJobsRealtimeBridge } from '@/features/pdf-jobs/hooks/PdfJobsRealtimeBridge'
import { JobDeliveryCoordinator } from '@/features/pdf-jobs/components/JobDeliveryCoordinator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function ProtectedLayout() {
  const auth = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (auth.status !== 'ready' || !auth.session) return
    const frame = window.requestAnimationFrame(() => document.getElementById('main-content')?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [auth.session?.user.id, auth.status, location.pathname])

  if (auth.status === 'loading') return <RouteLoading />
  if (auth.status === 'error') {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md items-center p-6 outline-none">
        <Alert variant="destructive">
          <AlertDescription>{auth.error}</AlertDescription>
          <Button className="mt-4" onClick={() => void auth.retry()}>重试</Button>
        </Alert>
      </main>
    )
  }
  if (!auth.session) return <Navigate to="/login" replace state={{ from: location }} />
  return (
    <PdfJobsRealtimeBridge>
      <a href="#main-content" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lifted transition-transform focus:translate-y-0">
        跳到主要内容
      </a>
      <JobDeliveryCoordinator />
      <div className="min-h-dvh">
        <div className="fixed inset-y-0 left-0 hidden w-72 border-r bg-card/90 backdrop-blur-xl lg:block">
          <AppSidebar />
        </div>
        <div className="lg:pl-72">
          <AppHeader />
          <Outlet />
        </div>
      </div>
    </PdfJobsRealtimeBridge>
  )
}

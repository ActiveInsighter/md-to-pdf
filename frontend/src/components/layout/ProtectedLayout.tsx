import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileNavigation } from './MobileNavigation'
import { RouteLoading } from './RouteLoading'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PdfJobsRealtimeBridge } from '@/features/pdf-jobs/hooks/PdfJobsRealtimeBridge'
import { JobDeliveryCoordinator } from '@/features/pdf-jobs/components/JobDeliveryCoordinator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function resetAppScroll() {
  const scrollContainer = document.getElementById('app-main-scroll')
  if (scrollContainer) {
    scrollContainer.scrollTop = 0
    scrollContainer.scrollLeft = 0
  }

  document.documentElement.scrollTop = 0
  document.documentElement.scrollLeft = 0
  document.body.scrollTop = 0
  document.body.scrollLeft = 0
}

export function ProtectedLayout() {
  const auth = useAuth()
  const location = useLocation()
  const jobStatusFilter = new URLSearchParams(location.search).get('status') ?? 'all'

  useEffect(() => {
    if (auth.status !== 'ready' || !auth.session) return

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [auth.session?.user.id, auth.status, location.pathname])

  useEffect(() => {
    if (auth.status !== 'ready' || !auth.session) return

    const frame = window.requestAnimationFrame(resetAppScroll)
    return () => window.cancelAnimationFrame(frame)
  }, [auth.session?.user.id, auth.status, jobStatusFilter, location.pathname])

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
      <div className="min-h-dvh min-w-0 overflow-x-hidden bg-background lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)] lg:overflow-hidden">
        <div className="z-40 hidden min-h-0 min-w-0 overflow-hidden border-r border-sidebar-border bg-sidebar lg:block">
          <AppSidebar />
        </div>
        <div className="fixed left-3 top-3 z-50 rounded-xl border bg-card shadow-panel lg:hidden">
          <MobileNavigation />
        </div>
        <div
          id="app-main-scroll"
          className="min-h-dvh min-w-0 overflow-x-hidden pt-14 lg:h-dvh lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain lg:pt-0 lg:[scrollbar-gutter:stable]"
        >
          <Outlet />
        </div>
      </div>
    </PdfJobsRealtimeBridge>
  )
}

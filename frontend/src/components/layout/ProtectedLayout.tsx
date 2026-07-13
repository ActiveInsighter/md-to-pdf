import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { PdfJobsRealtimeBridge } from '@/features/pdf-jobs/hooks/PdfJobsRealtimeBridge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function ProtectedLayout() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <div className="flex min-h-screen items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-primary" /></div>
  if (auth.status === 'error') return <div className="mx-auto flex min-h-screen max-w-md items-center p-6"><Alert variant="destructive"><AlertDescription>{auth.error}</AlertDescription><Button className="mt-4" onClick={() => void auth.retry()}>重试</Button></Alert></div>
  if (!auth.session) return <Navigate to="/login" replace state={{ from: location }} />
  return <PdfJobsRealtimeBridge><div className="min-h-screen bg-slate-50"><div className="fixed inset-y-0 left-0 hidden w-64 border-r lg:block"><AppSidebar /></div><div className="lg:pl-64"><AppHeader /><Outlet /></div></div></PdfJobsRealtimeBridge>
}

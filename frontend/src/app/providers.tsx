import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/hooks/useAuth'
import { queryClient } from '@/lib/queryClient'

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}><AuthProvider><TooltipProvider delayDuration={300}>{children}<Toaster richColors position="top-right" closeButton /></TooltipProvider></AuthProvider></QueryClientProvider>
}

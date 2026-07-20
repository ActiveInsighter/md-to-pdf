import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/hooks/useAuth'
import { queryClient } from '@/lib/queryClient'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delay={250}>
          {children}
          <Toaster richColors position="top-right" closeButton visibleToasts={3} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

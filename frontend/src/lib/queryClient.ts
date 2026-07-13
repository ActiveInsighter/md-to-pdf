import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        const message = error instanceof Error ? error.message : String(error)
        if (/401|403|not authorized|permission/i.test(message)) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})

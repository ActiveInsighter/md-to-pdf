import { useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { PdfJob } from '../types'
import { mergeJobIntoCache } from './cache'

export function PdfJobsRealtimeBridge({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const setRealtimeConnection = useWorkspaceStore((state) => state.setRealtimeConnection)

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setRealtimeConnection('disconnected')
      return
    }

    let active = true
    setRealtimeConnection('connecting')
    const channel = supabase
      .channel(`pdf-jobs-user-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pdf_jobs', filter: `user_id=eq.${userId}` }, (payload) => {
        if (!active || !payload.new || !('id' in payload.new)) return
        mergeJobIntoCache(queryClient, payload.new as PdfJob)
      })
      .subscribe((status) => {
        if (!active) return
        setRealtimeConnection(status === 'SUBSCRIBED' ? 'connected' : 'disconnected')
      })

    return () => {
      active = false
      setRealtimeConnection('disconnected')
      void supabase.removeChannel(channel)
    }
  }, [queryClient, session?.user.id, setRealtimeConnection])

  return children
}

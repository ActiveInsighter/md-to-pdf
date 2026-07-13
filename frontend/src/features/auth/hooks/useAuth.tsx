import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { clearAuthenticatedWorkspaceState } from './authenticatedWorkspaceState'

type AuthStatus = 'loading' | 'ready' | 'error'
type AuthContextValue = {
  session: Session | null
  status: AuthStatus
  error: string
  retry: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState('')
  const currentUserId = useRef<string | null>(null)

  const applySession = useCallback((nextSession: Session | null, forceClear = false) => {
    const previousUserId = currentUserId.current
    const nextUserId = nextSession?.user.id || null
    if (forceClear || (previousUserId !== null && previousUserId !== nextUserId)) {
      void clearAuthenticatedWorkspaceState(queryClient)
    }
    currentUserId.current = nextUserId
    setSession(nextSession)
  }, [queryClient])

  const initialize = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      applySession(data.session)
      setStatus('ready')
    } catch (cause) {
      applySession(null)
      setError(toUserMessage(cause, '会话恢复失败，请重试。'))
      setStatus('error')
    }
  }, [applySession])

  useEffect(() => {
    let active = true
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active || event === 'INITIAL_SESSION') return
      applySession(nextSession, event === 'SIGNED_OUT')
      setStatus('ready')
      setError('')
    })
    void initialize()
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [applySession, initialize])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    status,
    error,
    retry: initialize,
    signOut: async () => {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      if (currentUserId.current !== null) applySession(null, true)
    },
  }), [applySession, error, initialize, session, status])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

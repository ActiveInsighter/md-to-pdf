import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'

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
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState('')

  const initialize = async () => {
    setStatus('loading')
    setError('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      setSession(data.session)
      setStatus('ready')
    } catch (cause) {
      setSession(null)
      setError(toUserMessage(cause, '会话恢复失败，请重试。'))
      setStatus('error')
    }
  }

  useEffect(() => {
    let active = true
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active || event === 'INITIAL_SESSION') return
      setSession(nextSession)
      setStatus('ready')
      setError('')
    })
    void initialize()
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    status,
    error,
    retry: initialize,
    signOut: async () => {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
    },
  }), [error, session, status])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

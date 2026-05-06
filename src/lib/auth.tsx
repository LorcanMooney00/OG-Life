import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { User } from '@supabase/supabase-js'
import {
  initOneSignal,
  isOneSignalConfigured,
  linkOneSignalUser,
  unlinkOneSignalUserForSignOut,
} from './onesignal'
import { isSupabaseConfigured, supabase } from './supabaseClient'

type AuthContextValue = {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Base URL for auth email links (`emailRedirectTo`, password reset).
 * In dev, always use the tab you’re on so a stale `VITE_SITE_URL` from another
 * project doesn’t send confirm/reset links to the wrong host.
 * In production, set `VITE_SITE_URL` to this app’s origin (e.g. Vercel URL).
 */
function siteOrigin() {
  if (import.meta.env.DEV) {
    return window.location.origin
  }
  const fromEnv = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '')
  return fromEnv || window.location.origin
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) {
      setUser(null)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void initOneSignal()
  }, [])

  useEffect(() => {
    if (!user?.id || !isOneSignalConfigured()) return
    void linkOneSignalUser(user.id)
  }, [user?.id])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export async function signIn(email: string, password: string) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase is not configured') }
  }
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string, username: string) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase is not configured') }
  }

  const redirectTo = `${siteOrigin()}/app`

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { username: username.trim() },
    },
  })

  // Do not upsert `user_profiles` here: with "confirm email" enabled there is often
  // no JWT yet, so RLS blocks inserts. `schema.sql` trigger `on_auth_user_created`
  // already creates the row as SECURITY DEFINER, using raw_user_meta_data.username.

  return { data, error }
}

export async function signOut() {
  if (!supabase) {
    return { error: new Error('Supabase is not configured') }
  }
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user?.id
  await unlinkOneSignalUserForSignOut(uid)
  return supabase.auth.signOut({ scope: 'local' })
}

export async function resetPassword(email: string) {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured' }
  }

  const redirectTo = `${siteOrigin()}/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    console.error('Error sending password reset email:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

export async function updatePassword(newPassword: string) {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) {
    console.error('Error updating password:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

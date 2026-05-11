import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-stone-950 px-4 text-center text-stone-200">
        <p className="text-lg font-semibold">Supabase is not configured</p>
        <p className="mt-2 max-w-sm text-sm text-stone-400">
          Add <code className="text-amber-300">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-amber-300">VITE_SUPABASE_ANON_KEY</code> to your{' '}
          <code className="text-amber-300">.env</code> file, then restart the dev server.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-stone-950 text-stone-400">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

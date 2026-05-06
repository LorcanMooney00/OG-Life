import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from '../lib/auth'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) {
      setIsValidSession(false)
      setError('Supabase is not configured.')
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true)
      } else {
        setIsValidSession(false)
        setError('Invalid or expired reset link. Request a new password reset.')
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)

    try {
      const { success, error: updateError } = await updatePassword(newPassword)
      if (!success && updateError) {
        setError(updateError)
      } else {
        navigate('/login', { replace: true })
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 px-4 text-slate-400">
        Supabase is not configured.
      </div>
    )
  }

  if (isValidSession === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    )
  }

  if (isValidSession === false) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 px-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/[0.08] bg-[#1c1c1e] p-8">
          <h2 className="text-center text-xl font-bold text-white">Invalid reset link</h2>
          <p className="text-center text-sm text-[#8e8e93]">
            This link may have expired. Request a new one from the login screen.
          </p>
          {error && (
            <div className="rounded-xl border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 px-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/[0.08] bg-[#1c1c1e] p-8">
        <div>
          <h2 className="text-center text-xl font-bold text-white">Choose a new password</h2>
          <p className="mt-2 text-center text-sm text-[#8e8e93]">
            Use at least 6 characters
          </p>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-xl border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <div className="-space-y-px">
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              className="block w-full rounded-t-lg border border-[#3a3a3c] bg-[#2c2c2e] px-4 py-3 text-white placeholder-[#8e8e93] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              className="block w-full rounded-b-lg border border-[#3a3a3c] bg-[#2c2c2e] px-4 py-3 text-white placeholder-[#8e8e93] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}

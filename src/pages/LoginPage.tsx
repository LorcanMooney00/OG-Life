import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { resetPassword, signIn, signUp, useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'

function friendlyAuthMessage(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit')) {
    return 'Supabase is temporarily limiting auth emails. That often applies to your whole project or network (not only this address) after several signups or resets. Wait a while (often up to an hour), try signing in if the account already exists, or try again from a different network.'
  }
  return message
}

export default function LoginPage() {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  /** Blocks double submit before React re-renders `disabled` on the button. */
  const authActionLock = useRef(false)

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-stone-950 px-4 text-stone-200">
        <p className="text-center text-sm text-stone-400">
          Configure Supabase env vars to sign in.
        </p>
      </div>
    )
  }

  if (!loading && user) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (authActionLock.current) return
    authActionLock.current = true
    setError(null)
    setSuccess(null)
    setBusy(true)

    try {
      if (isSignUp) {
        if (!username.trim()) {
          setError('Username is required')
          return
        }
        const { data, error: authError } = await signUp(
          email,
          password,
          username.trim(),
        )
        if (authError) {
          setError(friendlyAuthMessage(authError.message))
        } else if (data?.session) {
          navigate('/app')
        } else {
          setSuccess(
            'Check your email to confirm your account, then sign in below. If you don’t see it, wait a few minutes before trying again (avoid signing up twice — that triggers rate limits).',
          )
          setIsSignUp(false)
          setPassword('')
        }
      } else {
        const { error: authError } = await signIn(email, password)
        if (authError) {
          setError(friendlyAuthMessage(authError.message))
        } else {
          navigate('/app')
        }
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setBusy(false)
      authActionLock.current = false
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (authActionLock.current) return
    authActionLock.current = true
    setError(null)
    setSuccess(null)
    setBusy(true)

    try {
      const { success: ok, error: resetError } = await resetPassword(email)
      if (!ok && resetError) {
        setError(friendlyAuthMessage(resetError))
      } else {
        setSuccess('Password reset email sent. Check your inbox.')
        setEmail('')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setBusy(false)
      authActionLock.current = false
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center bg-stone-950 px-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/[0.08] bg-[#1c1618] p-8 shadow-2xl ring-1 ring-white/[0.06]">
        <div>
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
            OG Life
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold text-white">
            {showResetPassword
              ? 'Reset your password'
              : isSignUp
                ? 'Create your account'
                : 'Sign in'}
          </h2>
          <p className="mt-2 text-center text-sm text-[#8e8e93]">
            {showResetPassword
              ? 'We’ll email you a reset link'
              : isSignUp
                ? 'Calendar & shopping, synced with your partner'
                : 'Welcome back'}
          </p>
        </div>

        <form
          className="mt-6 space-y-6"
          onSubmit={showResetPassword ? handleResetPassword : handleSubmit}
        >
          {error && (
            <div className="rounded-xl border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-green-700/50 bg-green-900/30 px-4 py-3 text-sm text-green-200">
              {success}
            </div>
          )}

          <div className="-space-y-px rounded-lg shadow-sm">
            {isSignUp && !showResetPassword && (
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="relative z-10 block w-full appearance-none rounded-t-lg border border-[#3a322f] bg-[#26201f] px-4 py-3 text-white placeholder-[#8e8e93] transition focus:z-20 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 sm:text-sm"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`relative z-10 block w-full appearance-none border border-[#3a322f] bg-[#26201f] px-4 py-3 text-white placeholder-[#8e8e93] transition focus:z-20 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 sm:text-sm ${
                  isSignUp && !showResetPassword ? '' : 'rounded-t-lg'
                }`}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {!showResetPassword && (
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  className="relative z-10 block w-full appearance-none rounded-b-lg border border-[#3a322f] bg-[#26201f] px-4 py-3 text-white placeholder-[#8e8e93] transition focus:z-20 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 sm:text-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full justify-center rounded-xl border border-transparent bg-amber-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-[#1c1618] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {busy
              ? 'Please wait…'
              : showResetPassword
                ? 'Send reset link'
                : isSignUp
                  ? 'Sign up'
                  : 'Sign in'}
          </button>

          <div className="space-y-2 text-center">
            {!showResetPassword && !isSignUp && (
              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(true)
                  setError(null)
                  setSuccess(null)
                  setPassword('')
                }}
                className="block w-full text-sm text-[#0a84ff] hover:underline"
              >
                Forgot password?
              </button>
            )}
            {showResetPassword ? (
              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(false)
                  setError(null)
                  setSuccess(null)
                }}
                className="text-sm text-[#0a84ff] hover:underline"
              >
                Back to sign in
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError(null)
                  setSuccess(null)
                  setUsername('')
                }}
                className="text-sm text-[#0a84ff] hover:underline"
              >
                {isSignUp
                  ? 'Already have an account? Sign in'
                  : 'Need an account? Sign up'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

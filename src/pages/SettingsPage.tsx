import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInstallPrompt } from '../contexts/InstallPromptContext'
import { signOut, updateUsername, useAuth } from '../lib/auth'
import type { PartnerSummary } from '../types'
import {
  initOneSignal,
  isOneSignalConfigured,
  isOneSignalRuntimeEnabled,
  optOutOneSignalOnDevice,
  promptOneSignalPush,
  refreshOneSignalPushState,
} from '../lib/onesignal'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage() {
  const { user } = useAuth()
  const [partnerEmail, setPartnerEmail] = useState('')
  const [partners, setPartners] = useState<PartnerSummary[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingPartners, setLoadingPartners] = useState(true)
  const [osPush, setOsPush] = useState<{
    ready: boolean
    supported: boolean
    subscribed: boolean
    skippedLocalhost: boolean
  }>({ ready: false, supported: false, subscribed: false, skippedLocalhost: false })
  const [pushBusy, setPushBusy] = useState(false)
  const currentUsername =
    (user?.user_metadata?.username as string | undefined)?.trim() ?? ''
  // SettingsPage is gated behind RequireAuth so `user` is already loaded on
  // first render. Initialise the input from the session lazily — we don’t want
  // to call setState in an effect just to sync with a derived value (lint
  // rule react-hooks/set-state-in-effect would also reject that pattern).
  const [username, setUsername] = useState(currentUsername)
  const [savedUsernameSeed, setSavedUsernameSeed] = useState(currentUsername)
  if (currentUsername !== savedUsernameSeed) {
    // Auth fired USER_UPDATED (e.g. another tab saved a new name). Snap the
    // input to the latest server value the moment we notice during render.
    setSavedUsernameSeed(currentUsername)
    setUsername(currentUsername)
  }
  const [savingUsername, setSavingUsername] = useState(false)
  const {
    deferred: deferredInstall,
    installMessage,
    promptInstall,
    clearInstallMessage,
  } = useInstallPrompt()

  const loadPartners = useCallback(async () => {
    if (!supabase || !user) {
      setPartners([])
      setLoadingPartners(false)
      return
    }

    setLoadingPartners(true)
    setError(null)

    const { data: links, error: linkErr } = await supabase
      .from('partner_links')
      .select('partner_id')
      .eq('user_id', user.id)

    if (linkErr) {
      setError(linkErr.message)
      setLoadingPartners(false)
      return
    }

    const ids = (links ?? []).map((r) => r.partner_id as string)
    if (ids.length === 0) {
      setPartners([])
      setLoadingPartners(false)
      return
    }

    const { data: profiles, error: profErr } = await supabase
      .from('user_profiles')
      .select('id,email,username')
      .in('id', ids)

    if (profErr) {
      setError(profErr.message)
      setLoadingPartners(false)
      return
    }

    setPartners(
      (profiles ?? []).map((p) => ({
        id: p.id as string,
        email: p.email as string,
        username: (p.username as string | null) ?? null,
      })),
    )
    setLoadingPartners(false)
  }, [user])

  useEffect(() => {
    void loadPartners()
  }, [loadPartners])

  const refreshOsPush = useCallback(async () => {
    if (!isOneSignalConfigured()) {
      setOsPush({ ready: true, supported: false, subscribed: false, skippedLocalhost: false })
      return
    }
    if (!isOneSignalRuntimeEnabled()) {
      setOsPush({ ready: true, supported: false, subscribed: false, skippedLocalhost: true })
      return
    }
    await initOneSignal()
    const { supported, subscribed } = await refreshOneSignalPushState()
    setOsPush({ ready: true, supported, subscribed, skippedLocalhost: false })
  }, [])

  useEffect(() => {
    void refreshOsPush()
  }, [refreshOsPush, user?.id])

  const handleEnablePush = async () => {
    if (!user) return
    setPushBusy(true)
    setError(null)
    try {
      await promptOneSignalPush()
      await refreshOsPush()
      setMessage('If a prompt appeared, choose Allow. Your device is linked in OneSignal.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not show notification prompt')
    } finally {
      setPushBusy(false)
    }
  }

  const handleDisablePush = async () => {
    if (!user) return
    setPushBusy(true)
    setError(null)
    try {
      await optOutOneSignalOnDevice(user.id)
      await refreshOsPush()
      setMessage('Opted out of push on this device.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn off push')
    } finally {
      setPushBusy(false)
    }
  }

  const handleLinkPartner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !user) return

    setBusy(true)
    setError(null)
    setMessage(null)

    const email = partnerEmail.trim()
    if (!email) {
      setError('Enter your partner’s email')
      setBusy(false)
      return
    }

    const { data: ok, error: rpcErr } = await supabase.rpc('link_partner_by_email', {
      p_partner_email: email,
    })

    if (rpcErr) {
      setError(rpcErr.message)
      setBusy(false)
      return
    }

    if (!ok) {
      setError(
        'Could not link. They may not have signed up yet, or you may have entered the wrong email.',
      )
      setBusy(false)
      return
    }

    setMessage('Partner linked. You can now share calendar and shopping.')
    setPartnerEmail('')
    await loadPartners()
    setBusy(false)
  }

  const handleUnlink = async (partnerId: string) => {
    if (!supabase || !user) return
    setBusy(true)
    setError(null)

    const { error: a } = await supabase
      .from('partner_links')
      .delete()
      .eq('user_id', user.id)
      .eq('partner_id', partnerId)

    const { error: b } = await supabase
      .from('partner_links')
      .delete()
      .eq('user_id', partnerId)
      .eq('partner_id', user.id)

    if (a || b) {
      setError(a?.message ?? b?.message ?? 'Could not unlink')
    } else {
      setMessage('Partner unlinked.')
      await loadPartners()
    }
    setBusy(false)
  }

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed === currentUsername) {
      setMessage('Display name unchanged.')
      return
    }
    setSavingUsername(true)
    setError(null)
    setMessage(null)
    const result = await updateUsername(trimmed)
    if (!result.success) {
      setError(result.error ?? 'Could not update display name')
    } else {
      setMessage('Display name updated.')
    }
    setSavingUsername(false)
  }

  const handleSignOut = async () => {
    setBusy(true)
    await signOut()
    setBusy(false)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header
        className="shrink-0 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3 pb-3">
          <Link
            to="/app"
            className="rounded-lg px-2 py-1 text-sm font-medium text-[#0a84ff] hover:bg-white/5"
          >
            ← Back
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/90">
              OG Life
            </p>
            <h1 className="text-lg font-semibold text-white">Account & partner</h1>
          </div>
        </div>
      </header>

      <main
        className="mx-auto w-full min-w-0 max-w-lg min-h-0 flex-1 touch-pan-y space-y-6 overflow-y-auto overscroll-y-contain px-4 py-4 [-webkit-overflow-scrolling:touch]"
        style={{
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
          <p className="text-[13px] uppercase tracking-wide text-[#8e8e93]">Signed in as</p>
          <p className="mt-1 truncate text-[17px] font-medium text-white">
            {user?.email ?? '—'}
          </p>
        </section>

        <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
          <p className="text-[15px] font-semibold text-white">Display name</p>
          <p className="mt-1 text-[13px] leading-snug text-[#8e8e93]">
            Used for the Home greeting and shown to any partners you’re linked with.
            If you signed up through the app you’ll already have one; accounts created
            directly in Supabase can set it here.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleSaveUsername}>
            <input
              type="text"
              autoComplete="nickname"
              maxLength={40}
              placeholder="e.g. Lorcan"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-[10px] border border-[#3a3a3c] bg-[#2c2c2e] px-3 py-3 text-[17px] text-white placeholder-[#8e8e93] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={savingUsername || username.trim().length === 0}
              className="w-full rounded-[10px] bg-indigo-600 py-3 text-[17px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {savingUsername ? 'Saving…' : 'Save display name'}
            </button>
          </form>
        </section>

        <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
          <p className="text-[15px] font-semibold text-white">Install on your device</p>
          <p className="mt-1 text-[13px] leading-snug text-[#8e8e93]">
            <span className="text-[#c7c7cc]">iPhone:</span> Apple only allows “install” from{' '}
            <span className="text-[#c7c7cc]">Safari</span> — open this site in Safari, tap Share →
            Add to Home Screen.{' '}
            <span className="text-[#c7c7cc]">Chrome on iPhone cannot install web apps.</span>
          </p>
          <p className="mt-3 text-[13px] leading-snug text-[#8e8e93]">
            Android (Samsung): in Chrome, tap ⋮ (may be under “More”) → Install app or Add to Home
            screen. Turn off Desktop site, avoid Incognito, and browse for a minute first — Chrome
            often delays install. If nothing shows, try Samsung Internet: menu → Add page to →
            Home screen.
          </p>
          {deferredInstall && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="mt-4 w-full rounded-[10px] bg-indigo-600 py-3 text-[17px] font-semibold text-white hover:bg-indigo-500"
            >
              Install OG Life
            </button>
          )}
          {installMessage && (
            <p className="mt-3 text-[13px] text-green-300/90">
              {installMessage}{' '}
              <button
                type="button"
                onClick={clearInstallMessage}
                className="text-[#0a84ff] underline"
              >
                Dismiss
              </button>
            </p>
          )}
        </section>

        <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
          <p className="text-[15px] font-semibold text-white">Push notifications (OneSignal)</p>
          <p className="mt-1 text-[13px] leading-snug text-[#8e8e93]">
            Delivered through OneSignal. This app uses a scoped service worker under <code className="text-indigo-300/90">/onesignal/</code> so it can run alongside the PWA worker (Lifestyle had no PWA, so it used OneSignal’s default root worker). Configure custom worker URLs in OneSignal to match.
          </p>
          {!isOneSignalConfigured() ? (
            <p className="mt-3 text-[13px] text-[#8e8e93]">
              Add <code className="text-indigo-300">VITE_ONESIGNAL_APP_ID</code> to your env and rebuild. Use the same
              Web app in OneSignal as this deployment’s origin.
            </p>
          ) : !osPush.ready ? (
            <p className="mt-3 text-[13px] text-[#8e8e93]">Checking this device…</p>
          ) : osPush.skippedLocalhost ? (
            <p className="mt-3 text-[13px] text-amber-200/90">
              OneSignal is skipped on <code className="text-indigo-300/90">localhost</code> (same idea as Lifestyle). Open your deployed HTTPS URL to test push, or set{' '}
              <code className="text-indigo-300/90">VITE_ONESIGNAL_ALLOW_LOCALHOST=true</code> for local experiments.
            </p>
          ) : !osPush.supported ? (
            <p className="mt-3 text-[13px] text-amber-200/90">This browser does not support web push.</p>
          ) : osPush.subscribed ? (
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void handleDisablePush()}
              className="mt-4 w-full rounded-[10px] border border-[#3a3a3c] bg-[#2c2c2e] py-3 text-[17px] font-semibold text-white hover:bg-[#3a3a3c] disabled:opacity-50"
            >
              {pushBusy ? 'Working…' : 'Turn off notifications on this device'}
            </button>
          ) : (
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void handleEnablePush()}
              className="mt-4 w-full rounded-[10px] bg-indigo-600 py-3 text-[17px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {pushBusy ? 'Working…' : 'Turn on notifications'}
            </button>
          )}
          <p className="mt-3 text-[12px] leading-snug text-[#8e8e93]">
            Subscription IDs are saved to <code className="text-indigo-300/90">push_subscriptions.onesignal_player_id</code>{' '}
            for your own automations; campaigns can also be sent from the OneSignal dashboard.
          </p>
        </section>

        <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
          <p className="text-[15px] font-semibold text-white">Link partner</p>
          <p className="mt-1 text-[13px] leading-snug text-[#8e8e93]">
            Enter the email they used to sign up. We’ll connect both accounts so you share
            calendar and shopping.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleLinkPartner}>
            <input
              type="email"
              autoComplete="email"
              placeholder="Partner’s email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              className="w-full rounded-[10px] border border-[#3a3a3c] bg-[#2c2c2e] px-3 py-3 text-[17px] text-white placeholder-[#8e8e93] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[10px] bg-indigo-600 py-3 text-[17px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Link partner
            </button>
          </form>
        </section>

        <section className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/[0.08]">
          <p className="text-[15px] font-semibold text-white">Linked partners</p>
          {loadingPartners ? (
            <p className="mt-3 text-[13px] text-[#8e8e93]">Loading…</p>
          ) : partners.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#8e8e93]">No partners linked yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {partners.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[17px] text-white">{p.email}</p>
                    {p.username && (
                      <p className="text-[13px] text-[#8e8e93]">{p.username}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUnlink(p.id)}
                    className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {message && (
          <div className="rounded-[12px] border border-green-700/40 bg-green-900/20 px-4 py-3 text-sm text-green-200">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-[12px] border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSignOut()}
          className="w-full rounded-[12px] border border-[#3a3a3c] bg-[#2c2c2e] py-3 text-[17px] font-semibold text-white hover:bg-[#3a3a3c] disabled:opacity-50"
        >
          Sign out
        </button>
      </main>
    </div>
  )
}

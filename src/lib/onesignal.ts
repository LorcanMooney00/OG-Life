import type { SubscriptionChangeEvent } from 'react-onesignal'
import OneSignal from 'react-onesignal'
import { supabase } from './supabaseClient'

let initPromise: Promise<void> | null = null
let pushListener: ((change: SubscriptionChangeEvent) => void) | null = null

export function isOneSignalConfigured(): boolean {
  return Boolean(import.meta.env.VITE_ONESIGNAL_APP_ID?.trim())
}

/**
 * Lifestyle-App skips OneSignal on localhost because the dashboard Site URL is production-only.
 * OG-Life also uses a scoped SW (`/onesignal/`) so Vite PWA Workbox can own `/` — unlike Lifestyle (no PWA).
 */
export function isOneSignalRuntimeEnabled(): boolean {
  if (!isOneSignalConfigured()) return false
  if (import.meta.env.VITE_ONESIGNAL_ALLOW_LOCALHOST === 'true') return true
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h !== 'localhost' && h !== '127.0.0.1'
}

/** Loads SDK + registers OneSignal’s scoped service worker (coexists with Vite PWA Workbox at `/`). */
export function initOneSignal(): Promise<void> {
  if (!isOneSignalRuntimeEnabled()) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = OneSignal.init({
    appId: import.meta.env.VITE_ONESIGNAL_APP_ID as string,
    allowLocalhostAsSecureOrigin: import.meta.env.DEV,
    serviceWorkerPath: '/onesignal/OneSignalSDKWorker.js',
    serviceWorkerUpdaterPath: '/onesignal/OneSignalSDKUpdaterWorker.js',
    serviceWorkerParam: { scope: '/onesignal/' },
    autoResubscribe: true,
  })

  return initPromise
}

async function syncSubscriptionToSupabase(userId: string, subscriptionId: string) {
  if (!supabase) return
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, onesignal_player_id: subscriptionId },
    { onConflict: 'user_id,onesignal_player_id' },
  )
  if (error) console.error('[OneSignal] push_subscriptions upsert', error)
}

/** Call after Supabase session exists — links device subscription to your user id in OneSignal + DB. */
export async function linkOneSignalUser(userId: string) {
  if (!isOneSignalRuntimeEnabled()) return
  await initOneSignal()

  await OneSignal.login(userId)

  if (pushListener) {
    OneSignal.User.PushSubscription.removeEventListener('change', pushListener)
    pushListener = null
  }

  pushListener = (ev: SubscriptionChangeEvent) => {
    const id = ev.current.id
    if (id) void syncSubscriptionToSupabase(userId, id)
  }
  OneSignal.User.PushSubscription.addEventListener('change', pushListener)

  const id = OneSignal.User.PushSubscription.id
  if (id) await syncSubscriptionToSupabase(userId, id)
}

/** Call before sign-out — clears OneSignal user and removes this account’s rows from `push_subscriptions`. */
export async function unlinkOneSignalUserForSignOut(userId: string | undefined) {
  if (!isOneSignalConfigured()) {
    if (userId && supabase) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    }
    return
  }

  if (isOneSignalRuntimeEnabled()) {
    try {
      await initOneSignal()
      if (pushListener) {
        OneSignal.User.PushSubscription.removeEventListener('change', pushListener)
        pushListener = null
      }
      await OneSignal.logout()
    } catch (e) {
      console.error('[OneSignal] unlink', e)
    }
  }

  if (userId && supabase) {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId)
  }
}

export async function refreshOneSignalPushState(): Promise<{
  supported: boolean
  subscribed: boolean
}> {
  if (!isOneSignalRuntimeEnabled()) {
    return { supported: false, subscribed: false }
  }
  await initOneSignal()
  if (!isOneSignalConfigured()) {
    return { supported: false, subscribed: false }
  }
  const supported = OneSignal.Notifications.isPushSupported()
  const subscribed =
    supported &&
    OneSignal.User.PushSubscription.optedIn === true &&
    Boolean(OneSignal.User.PushSubscription.id)
  return { supported, subscribed }
}

export async function promptOneSignalPush(): Promise<void> {
  if (!isOneSignalRuntimeEnabled()) return
  await initOneSignal()
  await OneSignal.Slidedown.promptPush({ force: true })
}

export async function optOutOneSignalOnDevice(userId: string): Promise<void> {
  if (!isOneSignalRuntimeEnabled()) return
  await initOneSignal()
  const sid = OneSignal.User.PushSubscription.id
  await OneSignal.User.PushSubscription.optOut()
  if (sid && supabase) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('onesignal_player_id', sid)
  }
}

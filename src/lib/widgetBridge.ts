import { Capacitor } from '@capacitor/core'
import type { Session } from '@supabase/supabase-js'
import { OgWidgets } from '../plugins/ogWidgets'
import { isSupabaseConfigured, supabase } from './supabaseClient'

/** True when running inside the Capacitor Android shell (not the browser PWA). */
export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/**
 * Copies the Supabase session into Android SharedPreferences so home-screen
 * widgets can call PostgREST without opening the WebView.
 */
export async function syncWidgetSessionFromSupabase(): Promise<void> {
  if (!isAndroidNative() || !isSupabaseConfigured || !supabase) return

  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) {
    await OgWidgets.clearSession()
    return
  }

  await pushSession(session)
}

export async function pushSession(session: Session): Promise<void> {
  if (!isAndroidNative()) return

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return

  await OgWidgets.syncSession({
    supabaseUrl: url.replace(/\/$/, ''),
    anonKey,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? 0,
  })
}

export async function clearWidgetSession(): Promise<void> {
  if (!isAndroidNative()) return
  await OgWidgets.clearSession()
}

import { registerPlugin } from '@capacitor/core'

export type WidgetSessionPayload = {
  supabaseUrl: string
  anonKey: string
  accessToken: string
  refreshToken: string
  /** Unix seconds */
  expiresAt: number
}

export interface OgWidgetsPlugin {
  syncSession(options: WidgetSessionPayload): Promise<void>
  clearSession(): Promise<void>
}

export const OgWidgets = registerPlugin<OgWidgetsPlugin>('OgWidgets', {
  web: {
    syncSession: async () => undefined,
    clearSession: async () => undefined,
  },
})

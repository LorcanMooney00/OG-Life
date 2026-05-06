/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Chrome / Edge (mainly Android) — not fired on iOS or iPhone Chrome. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Production site origin for email redirects (optional in dev). */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

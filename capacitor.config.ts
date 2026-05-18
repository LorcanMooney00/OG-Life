import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android shell for OG Life. The WebView loads the built SPA from `webDir`
 * (run `npm run build` then `npx cap sync android`).
 *
 * For live-reload during native dev, set CAPACITOR_SERVER_URL=http://YOUR_LAN_IP:5173
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.oglife.app',
  appName: 'OG Life',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
}

export default config

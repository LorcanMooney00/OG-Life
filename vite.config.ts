import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const site = env.VITE_SITE_URL?.replace(/\/$/, '')
  const manifestId = site ? `${site}/` : undefined

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'OG Life',
          short_name: 'OG Life',
          description: 'Calendar and shopping, shared with your partner.',
          ...(manifestId ? { id: manifestId } : {}),
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          display_override: ['standalone', 'browser'],
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
        lang: 'en',
        dir: 'ltr',
        prefer_related_applications: false,
        categories: ['lifestyle', 'productivity'],
        shortcuts: [
          {
            name: 'Home',
            short_name: 'Home',
            url: '/app',
            icons: [
              {
                src: 'pwa-192.png',
                sizes: '192x192',
                type: 'image/png',
              },
            ],
          },
        ],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
    ],
  }
})

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icons/*.png', 'pieces/*.svg', 'engine/*', 'data/**/*.json'],
      manifest: {
        name: 'Ply: chess tutor',
        short_name: 'Ply',
        description: 'A personal chess tutor that explains every move.',
        start_url: '/#/tutor',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#eceeec',
        theme_color: '#eceeec',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/source\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});

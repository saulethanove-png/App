import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// npm run build       → веб-приложение (PWA) в dist/ — для GitHub Pages и iPhone
// npm run build:file  → один файл dist-file/index.html, открывается двойным щелчком без сервера
export default defineConfig(({ mode }) => ({
  base: './',
  plugins:
    mode === 'file'
      ? [react(), viteSingleFile()]
      : [
          react(),
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'Money Flow — личные финансы',
              short_name: 'Money Flow',
              description: 'Учёт доходов и расходов, бюджет, цели и импорт выписок Kaspi',
              lang: 'ru',
              start_url: './',
              scope: './',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#0B1328',
              theme_color: '#0B1328',
              icons: [
                { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,mjs}'],
              maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
              navigateFallback: 'index.html',
              runtimeCaching: [
                {
                  urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
                  handler: 'CacheFirst',
                  options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
                },
              ],
            },
          }),
        ],
  build: { outDir: mode === 'file' ? 'dist-file' : 'dist', chunkSizeWarningLimit: 2500 },
}));

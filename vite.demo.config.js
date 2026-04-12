import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, extname } from 'path';
import { existsSync } from 'fs';

/**
 * Resolve `.js` imports to `.ts` files in the dev server.
 * The engine source uses `.js` extension for all TS imports (ESM convention).
 */
function tsExtensionFallback() {
  return {
    name: 'ts-extension-fallback',
    resolveId(source, importer) {
      if (!importer) return null;
      if (extname(source) !== '.js') return null;
      const tsPath = source.replace(/\.js$/, '.ts');
      const base = resolve(importer, '..', tsPath);
      if (existsSync(base)) return base;
      return null;
    },
  };
}

// Set VITE_BASE=/CalendarThatWorks/ when building for GitHub Pages.
// Defaults to '/' for local dev and preview.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tsExtensionFallback(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'WorksCalendar — IHC Fleet Demo',
        short_name: 'WorksCalendar',
        description: 'Drop-in embeddable React calendar with filter pills, hover cards, and Excel export',
        theme_color: '#4f46e5',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  root: 'demo',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});

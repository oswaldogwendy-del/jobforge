import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// CI sets BASE_PATH=/<repo>/ because GitHub Pages serves the site from a subpath.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      // "Update ready, tap to restart" instead of reloading mid-run (PRD Section 4).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Jobforge',
        short_name: 'Jobforge',
        description: 'Phone-first 3D action RPG where stats unlock your skills.',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#10162b',
        theme_color: '#10162b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app and every asset so the game reloads offline.
        globPatterns: ['**/*.{js,css,html,glb,png,svg,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});

// vite.config.ts への追記サンプル(要点は VitePWA の registerType: 'prompt')。
// 既存の plugins 配列に VitePWA(...) を足す。manifest は各アプリに合わせて調整。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' = 新版を自動適用せず、ReloadPrompt バナーでユーザーにワンタップ更新させる。
      // ('autoUpdate' だと勝手にリロードされ、更新タイミングを制御できない)
      registerType: 'prompt',
      includeAssets: ['logo.png', 'favicon.ico'],
      manifest: {
        name: 'アプリ名',
        short_name: 'アプリ',
        lang: 'ja',
        theme_color: '#1a1313',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'logo.png', sizes: '192x192', type: 'image/png' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})

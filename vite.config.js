import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
    manifest: {
      name: 'MoveLab 動作分析', short_name: 'MoveLab', description: '手機動作分析工具',
      theme_color: '#101b2b', background_color: '#f4f7fb', display: 'standalone',
      orientation: 'portrait', start_url: '/', scope: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    }
  })]
})
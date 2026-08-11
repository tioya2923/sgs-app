import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/sgs-app/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Por omissão o plugin só ativa o manifest/service worker no build de
      // produção — sem isto, testar o pedido de instalação com "npm run dev"
      // nunca mostrava nada, porque o browser não tinha como considerar o
      // site instalável.
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        id: '/sgs-app/',
        name: 'Sistema de Gestão Social — Centro Social Paroquial de São Nicolau',
        short_name: 'SGS App',
        description:
          'Aplicação para apoiar a gestão de operações sociais e de atendimento do Centro Social Paroquial de São Nicolau.',
        start_url: '/sgs-app/',
        scope: '/sgs-app/',
        display: 'standalone',
        background_color: '#f6f2e9',
        theme_color: '#1b3025',
        lang: 'pt-PT',
        icons: [
          { src: '/sgs-app/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/sgs-app/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/sgs-app/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})

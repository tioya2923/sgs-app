import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Caminho onde a app é servida: '/sgs-app/' no GitHub Pages; '/' quando a própria API
// serve o frontend (deploy num só serviço, ver DEPLOY.md). Define-se com VITE_BASE.
const base = (process.env.VITE_BASE ?? '/sgs-app/').replace(/\/?$/, '/')

export default defineConfig({
  base,
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
        id: base,
        name: 'Sistema de Gestão Social — Centro Social Paroquial de São Nicolau',
        short_name: 'SGS App',
        description:
          'Aplicação para apoiar a gestão de operações sociais e de atendimento do Centro Social Paroquial de São Nicolau.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f2e9',
        theme_color: '#1b3025',
        lang: 'pt-PT',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${base}icons/icon-512-maskable.png`,
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

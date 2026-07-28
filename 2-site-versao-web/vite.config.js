import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Amigos da Rozy Costa',
        short_name: 'Amigos da Rozy Costa',
        description: 'Sua rede de indicações e reuniões',
        lang: 'pt-BR',
        theme_color: '#090C12',
        background_color: '#090C12',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['social', 'business'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Deixa o app abrindo rápido (e funcionando com internet instável)
        // ao guardar em cache os arquivos da interface. Os dados (cadastros,
        // reuniões, mensagens) sempre vêm direto do Supabase, nunca do cache.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  // Ao publicar na HostGator, se o site ficar em uma subpasta (ex: seudominio.com/app),
  // troque a linha abaixo para base: '/app/'
  base: '/',
  build: {
    outDir: 'dist',
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
  ],
  // Ao publicar na HostGator, se o site ficar em uma subpasta (ex: seudominio.com/app),
  // troque a linha abaixo para base: '/app/'
  base: '/',
  build: {
    outDir: 'dist',
  },
});

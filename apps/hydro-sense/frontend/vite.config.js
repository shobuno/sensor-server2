// apps/hydro-sense/frontend/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  plugins: [react()],
  base: '/hydro-sense/',
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer()
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
//  server: {
//    host: '0.0.0.0',
//    port: 5173,
//    proxy: {
//      '/api': {
//        target: 'https://api.shobuno.org',
//        changeOrigin: true,
//        secure: true,
//        rewrite: path => path.replace(/^\/api/, ''),
//      },
//    },
//  },
});

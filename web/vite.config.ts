/**
 * Vite config cho web dashboard (thư mục web/).
 * - React + Tailwind CSS v4
 * - build ra web/dist (Express sẽ serve thư mục này ở production)
 * - dev server port 5173, proxy /api sang API server port 3000
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: './',
  build: {
    outDir: resolve(__dirname, '../dist/dashboard'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/stats': 'http://localhost:7438',
      '/context': 'http://localhost:7438',
      '/observations': 'http://localhost:7438',
      '/timeline': 'http://localhost:7438',
      '/projects': 'http://localhost:7438',
    },
  },
});

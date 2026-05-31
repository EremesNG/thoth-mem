import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const apiBaseUrl = `http://localhost:${process.env.THOTH_HTTP_PORT ?? '7438'}`;

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
      '/stats': apiBaseUrl,
      '/context': apiBaseUrl,
      '/observations': apiBaseUrl,
      '/timeline': apiBaseUrl,
      '/projects': apiBaseUrl,
      '/observatory': apiBaseUrl,
      '/viz': apiBaseUrl,
      '/openapi.json': apiBaseUrl,
    },
  },
});

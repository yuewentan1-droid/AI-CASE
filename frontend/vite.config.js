import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 8080,
    proxy: {
      '/api': { target: 'http://localhost:5050', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});

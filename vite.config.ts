import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const clientPort = Number(process.env.VITE_CLIENT_PORT || 3000);
const serverPort = process.env.SERVER_PORT || 3001;

export default defineConfig({
  server: {
    port: clientPort,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
      '/musics': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          payments: ['@stripe/stripe-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});

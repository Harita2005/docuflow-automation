import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true, // Exposes the server on all local IPs (0.0.0.0)
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/database.json', '**/uploads/**', '**/.system_generated/**']
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        },
        '/uploads': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: true
        }
      }
    },
    test: {
      environment: 'jsdom',
      globals: true
    }
  };
});

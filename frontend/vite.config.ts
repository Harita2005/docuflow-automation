import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react() as any, tailwindcss() as any],
    resolve: {
      dedupe: ['react', 'react-dom'],
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
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              console.error('[Vite Proxy Error] Backend server on port 3000 unreachable:', err.message);
              if (res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Backend server on port 3000 is not running. Please start backend using python run.py' }));
              }
            });
          }
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true
        },
        '/stored_pdfs': {
          target: 'http://localhost:3000',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://localhost:3000',
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

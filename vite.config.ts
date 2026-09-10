import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * The dashboard is served from the SAME ORIGIN as the payments API.
 *
 * Not a stylistic choice: the API sets one `CORS_ORIGIN`, and it belongs to the
 * public fundraiser site. Rather than widening that - which would let any
 * browser page call the API - the dashboard is same-origin with it, so the
 * admin requests are not cross-origin at all and no CORS relaxation is needed.
 *
 * In development that is what this proxy does: the browser only ever talks to
 * this dev server, which forwards `/admin/*` to the API. In production, serve
 * the built files behind the same hostname as the API (a `/admin` path on the
 * load balancer), or set VITE_API_BASE_URL and add that origin to CORS_ORIGIN.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5175, not the Vite default: 5173 is the public fundraiser site and 5174
    // is commonly taken by another project on this machine. Set explicitly,
    // because with `strictPort` below and no port here Vite falls back to 5173
    // and fails against the site.
    port: 5175,
    // Fail rather than silently move to another port: the proxy target and the
    // documentation are written against this one.
    strictPort: true,
    proxy: {
      '/admin': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React changes far less often than this app does, so it gets its own
          // chunk and stays cached across deploys. Windows and POSIX separators
          // both, since the id comes from the bundler's own resolution.
          const path = id.split('\\').join('/');
          if (/node_modules\/(react|react-dom|scheduler)\//.test(path)) {
            return 'react';
          }
        }
      }
    }
  }
});

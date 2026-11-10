import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Override with API_TARGET=http://host:port npm run dev
      // A regex key (leading ^) so only `/api/…` is proxied — a plain '/api' prefix also caught the
      // app's own `/api-keys` page and broke reloading it.
      '^/api/': { target: process.env.API_TARGET ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});

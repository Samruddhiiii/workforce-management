// vite.config.js
// Vite dev server settings.
//  - port 5173 must match CLIENT_URL in backend/.env, because the backend
//    only accepts requests (with cookies) from that address (CORS).
//  - strictPort: if 5173 is busy, stop with an error instead of silently
//    moving to 5174 (which the backend would reject).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // ship both entry pages: the React app and the CONTINENTAL showcase
      input: {
        main: 'index.html',
        landing: 'landing.html'
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      // Socket.IO needs its own rule with WebSocket support enabled —
      // otherwise dev sockets 404 at the :5173 origin.
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true
      }
    }
  }
});

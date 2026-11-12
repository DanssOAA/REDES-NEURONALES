import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El frontend corre en el puerto 5173 y reenvía al backend de Python (8000)
// todo lo que empiece por /api y el canal en tiempo real /ws.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
})

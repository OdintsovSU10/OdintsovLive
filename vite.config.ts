import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth/v1': {
        target: 'https://odintsovlive.duckdns.org',
        changeOrigin: true,
        secure: false
      },
      '/rest/v1': {
        target: 'https://odintsovlive.duckdns.org',
        changeOrigin: true,
        secure: false
      },
      '/storage/v1': {
        target: 'https://odintsovlive.duckdns.org',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
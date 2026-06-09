import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    devSourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ts': path.resolve(__dirname, 'src', 'ts'),
      'advi-ui/styles': path.resolve(__dirname, 'node_modules/advi-ui/dist/advi-ui.css'),
      'advi-ui/themes': path.resolve(__dirname, 'node_modules/advi-ui/dist/advi-ui.css'),
    },
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL),
  },
})

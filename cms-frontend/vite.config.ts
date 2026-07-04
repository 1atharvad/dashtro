/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// The default dev tunnel hostname stays allowed even if VITE_DEV_ALLOWED_HOST
// is set to something else — it's appended, not replaced. Vite otherwise
// rejects requests for unknown Host headers as a DNS-rebinding protection.
const DEFAULT_DEV_ALLOWED_HOST = 'local.atharvadevasthali.com';
const devAllowedHosts = [DEFAULT_DEV_ALLOWED_HOST];
if (process.env.VITE_DEV_ALLOWED_HOST && !devAllowedHosts.includes(process.env.VITE_DEV_ALLOWED_HOST)) {
  devAllowedHosts.push(process.env.VITE_DEV_ALLOWED_HOST);
}

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: devAllowedHosts,
  },
  css: {
    devSourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ts': path.resolve(__dirname, 'src', 'ts'),
    },
  },
  // Vitest reuses this config, including the resolve.alias above, so test
  // files can import via the same '@'/'@ts' paths as app code.
  test: {
    environment: 'jsdom',
    globals: false,
  },
  build: {
    rollupOptions: {
      output: {
        // Only splits large, standalone leaf packages that nothing else in
        // the bundle imports *into* — safe to isolate. Deliberately does NOT
        // split @mui/*, @emotion/*, react, or react-redux: MUI's internals
        // have circular cross-module references, and splitting those into
        // separate chunks previously caused a `Cannot access X before
        // initialization` crash at chunk-load time (broke chunk load order).
        // Let Rollup auto-chunk everything else instead of guessing.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'vendor-monaco';
          if (id.includes('mermaid') || id.includes('rehype-mermaid')) return 'vendor-mermaid';
          if (id.includes('@uiw/react-md-editor') || id.includes('@uiw/react-codemirror')) return 'vendor-md-editor';
          if (id.includes('react-live')) return 'vendor-react-live';
        },
      },
    },
  },
})

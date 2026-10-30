import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: { entry: 'src/sw/service-worker.ts', formats: ['iife'], name: 'flamerServiceWorker', fileName: () => 'sw.js' },
  },
})

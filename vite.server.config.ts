import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: 'src/node/server.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rolldownOptions: { output: { entryFileNames: 'server.mjs' } },
  },
})

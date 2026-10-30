import path from 'node:path'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { apiPlugin } from './vite-plugin-api.ts'

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? (process.env.PAGES_BASE ?? '/Flamer-Dashboard/') : '/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    ...(mode === 'pages' ? [] : [apiPlugin()]),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: { include: ['tests/**/*.test.ts'] },
}))

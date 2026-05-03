import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // Resolve env from the directory that contains this config (not only process.cwd()),
  // so `vercel dev` and other wrappers still pick up `.env.local`.
  const env = loadEnv(mode, projectRoot, 'VITE')

  // Encode the Supabase anon key at build time so the raw JWT (`eyJhbG...`)
  // never appears as a plain string literal in the minified bundle.
  const rawKey = env.VITE_SUPABASE_ANON_KEY || ''
  const encodedKey = Buffer.from(rawKey).toString('base64')

  return {
    plugins: [react()],
    define: {
      // __SB_EK is base64(anonKey) — decoded at runtime with atob()
      '__SB_EK': JSON.stringify(encodedKey),
    },
    server: {
      port: 3000,
      open: true,
    },
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
        mangle: true,
        format: {
          comments: false,
        },
      },
    },
  }
})

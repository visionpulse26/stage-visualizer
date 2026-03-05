import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE')

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

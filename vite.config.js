import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// Emulate Vercel serverless for api/**/*.js when using npm run dev (plain Vite).
function vercelApiLocalPlugin() {
  const routeTable = new Map([
    ['/api/get-upload-url', () => import('./api/get-upload-url.js')],
    ['/api/get-snapshot-url', () => import('./api/get-snapshot-url.js')],
    ['/api/oembed', () => import('./api/oembed.js')],
    ['/api/cleanup-analytics', () => import('./api/cleanup-analytics.js')],
    ['/api/admin/scan', () => import('./api/admin/scan.js')],
    ['/api/admin/delete-r2', () => import('./api/admin/delete-r2.js')],
    ['/api/admin/project-mutate', () => import('./api/admin/project-mutate.js')],
    ['/api/admin/r2-objects', () => import('./api/admin/r2-objects.js')],
  ])

  function enhanceRes(nodeRes) {
    const chain = {
      status(code) {
        nodeRes.statusCode = code
        return chain
      },
      json(body) {
        if (nodeRes.headersSent) return chain
        nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8')
        nodeRes.end(typeof body === 'string' ? body : JSON.stringify(body))
        return chain
      },
    }
    return chain
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('error', reject)
      req.on('end', () => {
        if (chunks.length === 0) return resolve(undefined)
        const raw = Buffer.concat(chunks).toString('utf8')
        if (!raw) return resolve(undefined)
        try {
          resolve(JSON.parse(raw))
        } catch {
          resolve(undefined)
        }
      })
    })
  }

  return {
    name: 'vercel-api-local',
    enforce: 'pre',
    configureServer(server) {
      const envOnce = loadEnv(server.config.mode, projectRoot, '')
      for (const [k, v] of Object.entries(envOnce)) {
        if (process.env[k] === undefined) process.env[k] = v
      }

      server.middlewares.use(async (nodeReq, nodeRes, next) => {
        try {
          const url = new URL(nodeReq.url || '/', 'http://127.0.0.1')
          const pathname = url.pathname
          if (!pathname.startsWith('/api/')) return next()

          const loader = routeTable.get(pathname)
          if (!loader) return next()

          const req = nodeReq
          req.query = Object.fromEntries(url.searchParams)
          req.body = undefined
          const method = (nodeReq.method || 'GET').toUpperCase()
          if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            req.body = (await readJsonBody(nodeReq)) ?? {}
          }

          const res = enhanceRes(nodeRes)
          const mod = await loader()
          const handler = mod.default
          if (typeof handler !== 'function') return next()
          await handler(req, res)
        } catch (e) {
          console.error('[vercel-api-local]', e)
          if (!nodeRes.headersSent) {
            nodeRes.statusCode = 500
            nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8')
            nodeRes.end(JSON.stringify({ error: 'API handler error', detail: String(e?.message || e) }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, projectRoot, 'VITE')

  return {
    plugins: [vercelApiLocalPlugin(), react()],
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

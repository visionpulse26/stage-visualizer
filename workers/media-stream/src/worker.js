/**
 * media-stream Worker — signed, Range-capable streaming proxy in front of R2.
 *
 * Why: the app used to download whole videos into a blob before playback (no
 * streaming). This Worker lets `<video src>` stream directly: it validates a
 * short-lived HMAC token minted by /api/get-stream-token, then serves the object
 * from an R2 binding honouring HTTP Range (206) so the first frame arrives in
 * ~1s instead of after the whole file.
 *
 * Route (custom domain): https://media.<domain>/v/<key>?t=<exp>.<hmacHex>
 *   <key> is the R2 object key, e.g. `proj1/media/123_clip.mp4`.
 *   projectId = first path segment of the key; the token is bound to it, so a
 *   token for project A cannot stream project B's objects.
 *
 * Bindings / vars (wrangler.toml):
 *   [[r2_buckets]] binding = "MEDIA"   → the public media bucket
 *   MEDIA_STREAM_SECRET (secret)       → must equal Vercel's MEDIA_STREAM_SECRET
 *   ALLOWED_ORIGINS (var, comma list)  → CORS allow-list for <video crossOrigin>
 */

const PREFIX = '/v/'

const encoder = new TextEncoder()
let cachedKey = null // CryptoKey for HMAC, memoized per isolate

async function getHmacKey(secret) {
  if (cachedKey) return cachedKey
  cachedKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return cachedKey
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0')
  return hex
}

// Constant-time string compare to avoid leaking the signature via timing.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// Verify `${exp}.${hmacHex}` over `${projectId}:${exp}` — mirrors signStreamToken
// in api/get-stream-token.js. Returns true when valid and unexpired.
async function verifyToken(token, projectId, secret) {
  if (!token || !projectId) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const exp = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false

  const key = await getHmacKey(secret)
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${projectId}:${exp}`))
  return timingSafeEqual(sig, toHex(mac))
}

// Parse an HTTP `Range: bytes=...` header into R2 get() range options.
// Returns { offset, length } | { suffix } | null (unsatisfiable/absent).
function parseRange(rangeHeader) {
  if (!rangeHeader) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m) return null
  const startStr = m[1]
  const endStr = m[2]
  if (startStr === '' && endStr === '') return null
  if (startStr === '') return { suffix: Number(endStr) }            // bytes=-N (last N)
  const offset = Number(startStr)
  if (endStr === '') return { offset }                              // bytes=N- (from N)
  const end = Number(endStr)
  if (end < offset) return null
  return { offset, length: end - offset + 1 }                      // bytes=N-M
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  const list = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.includes(origin) ? origin : null
}

function corsHeaders(request, env, headers = new Headers()) {
  const origin = allowedOrigin(request, env)
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Range')
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag')
  return headers
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(request, env) })
    }
    if (!env.MEDIA_STREAM_SECRET) {
      return new Response('Not configured', { status: 503, headers: corsHeaders(request, env) })
    }

    const url = new URL(request.url)
    if (!url.pathname.startsWith(PREFIX)) {
      return new Response('Not found', { status: 404, headers: corsHeaders(request, env) })
    }

    const key = decodeURIComponent(url.pathname.slice(PREFIX.length))
    if (!key || key.includes('..')) {
      return new Response('Bad request', { status: 400, headers: corsHeaders(request, env) })
    }
    const projectId = key.split('/')[0]
    const token = url.searchParams.get('t') || ''

    if (!(await verifyToken(token, projectId, env.MEDIA_STREAM_SECRET))) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders(request, env) })
    }

    const rangeOpt = parseRange(request.headers.get('Range'))

    const object = await env.MEDIA.get(key, rangeOpt ? { range: rangeOpt } : undefined)
    if (!object) {
      return new Response('Not found', { status: 404, headers: corsHeaders(request, env) })
    }

    const headers = corsHeaders(request, env)
    object.writeHttpMetadata(headers)
    headers.set('Accept-Ranges', 'bytes')
    headers.set('ETag', object.httpEtag)
    // Immutable: keys are timestamped (sanitizeKey), so a key never changes bytes.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    const size = object.size // full object size
    let status = 200
    if (rangeOpt && object.range) {
      const start = object.range.offset ?? (size - (object.range.length ?? object.range.suffix ?? 0))
      const length = object.range.length ?? (size - start)
      const end = start + length - 1
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
      headers.set('Content-Length', String(length))
      status = 206
    } else {
      headers.set('Content-Length', String(size))
    }

    // HEAD must not carry a body.
    const body = request.method === 'HEAD' ? null : object.body
    return new Response(body, { status, headers })
  },
}

// Named exports for unit tests (the default export is what Wrangler runs).
export { parseRange, verifyToken }

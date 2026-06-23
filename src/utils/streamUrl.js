/**
 * Video streaming via the media-stream Cloudflare Worker.
 *
 * Why this exists: video used to be played through the blob loader
 * (secureAssetLoader.fetchAsBlobUrlWithCache), which downloads the ENTIRE file
 * into RAM before `<video>.src` can be set — no HTTP Range streaming, so the
 * viewer waits for the whole file before the first frame. This helper rewrites
 * an R2 public URL to a tokened Worker URL the browser can stream directly:
 * `${VITE_MEDIA_STREAM_BASE}/v/${key}?t=${token}` → Worker serves 206 ranges.
 *
 * Feature-gated: when `VITE_MEDIA_STREAM_BASE` is unset (no Worker deployed) or
 * no token is available, the build functions return null and callers MUST fall
 * back to the blob loader. This keeps the app deployable before the Cloudflare
 * infra exists. Images deliberately keep the blob loader (IP protection).
 *
 * The HMAC secret never reaches the client — `VITE_*` vars are inlined into the
 * bundle (visible in DevTools). The token is minted server-side by
 * /api/get-stream-token and is opaque to the client (format: `${exp}.${hmac}`).
 *
 * Note: supabase is imported lazily (inside getStreamToken) so the pure URL
 * helpers below stay importable from a plain-Node test runner — a top-level
 * `import '../lib/supabaseClient'` throws when Vite env vars are absent.
 */

const STREAM_BASE = String(import.meta.env?.VITE_MEDIA_STREAM_BASE || '').replace(/\/$/, '')

/** True when a media-stream Worker base URL is configured. */
export function isStreamingConfigured() {
  return Boolean(STREAM_BASE)
}

/**
 * Pure: rewrite a remote R2 video URL to a tokened Worker stream URL.
 * Returns null when streaming isn't configured, the token is missing, or the
 * URL isn't a streamable http(s) remote — caller falls back to the blob loader.
 *
 * @param {string} remoteUrl  public R2 URL, e.g. https://media.../proj/media/123_clip.mp4
 * @param {string} token      opaque token from /api/get-stream-token
 * @param {string} [base]     override the Worker base (defaults to env)
 * @returns {string|null}
 */
export function buildVideoStreamUrl(remoteUrl, token, base = STREAM_BASE) {
  if (!base || !token || !remoteUrl) return null
  if (typeof remoteUrl !== 'string' || remoteUrl.startsWith('blob:') || remoteUrl.startsWith('data:')) return null
  let key
  try {
    const u = new URL(remoteUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    key = u.pathname.replace(/^\/+/, '')
  } catch {
    return null
  }
  if (!key) return null
  return `${base}/v/${key}?t=${encodeURIComponent(token)}`
}

// ── Session token cache ──────────────────────────────────────────────────────
// One token per project per session; refreshed shortly before expiry. The
// endpoint authorizes anon (published projects) and authed callers alike, so we
// attach the Supabase bearer only when a session exists.
let tokenCache = null // { token: string, exp: number, projectId: string }

/**
 * Fetch (and cache) a stream token for a project. Returns null when streaming is
 * not configured or the endpoint declines — callers then fall back to blob.
 * @param {string} projectId
 * @returns {Promise<string|null>}
 */
export async function getStreamToken(projectId) {
  if (!isStreamingConfigured() || !projectId) return null
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.projectId === projectId && tokenCache.exp - 60 > now) {
    return tokenCache.token
  }
  try {
    const { supabase } = await import('../lib/supabaseClient')
    const { data } = await supabase.auth.getSession().catch(() => ({ data: null }))
    const accessToken = data?.session?.access_token
    const headers = { 'Content-Type': 'application/json' }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    const res = await fetch('/api/get-stream-token', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId }),
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    if (!json?.token) return null
    tokenCache = { token: json.token, exp: Number(json.exp) || now + 3600, projectId }
    return tokenCache.token
  } catch {
    return null
  }
}

/** Drop the cached token (call on project switch / sign-out). */
export function clearStreamToken() {
  tokenCache = null
}

/**
 * Resolve a remote media URL to a playable `src`, shared by every viewer page.
 *
 * - Video + streaming configured + token available → tokened Worker URL (the
 *   browser streams it via Range; no blob download).
 * - Otherwise → `blobFallback(url)` (the page's existing blob loader). Images
 *   always take this path (IP protection unchanged).
 *
 * @param {object} opts
 * @param {string} opts.url           remote (or local) media URL
 * @param {string} opts.projectId
 * @param {boolean} opts.isVideo
 * @param {(url: string) => Promise<string>|string} [opts.blobFallback]
 * @returns {Promise<string>}
 */
export async function resolvePlayableSrc({ url, projectId, isVideo, blobFallback }) {
  if (!url) return url
  const remote = url.startsWith('http://') || url.startsWith('https://')
  if (!remote) return url
  if (isVideo && isStreamingConfigured()) {
    const token = await getStreamToken(projectId)
    const streamUrl = buildVideoStreamUrl(url, token)
    if (streamUrl) return streamUrl
  }
  return blobFallback ? blobFallback(url) : url
}

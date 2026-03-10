/**
 * IP Protection: Fetch assets as Blobs and serve via temporary object URLs.
 * Prevents direct URL exposure to loaders. Caller must revoke URLs after load.
 *
 * Caching: Uses Cache API for heavy 3D assets and HDRI. Cache-first for
 * instant loads on repeat visits; network fallback triggers progress UI.
 */

const CACHE_NAME = 'stage-visualizer-assets'
const CACHE_VERSION = 1

async function openCache() {
  const name = `${CACHE_NAME}-v${CACHE_VERSION}`
  if (typeof caches !== 'undefined') return caches.open(name)
  return null
}

/**
 * Fetches a URL with cache-first strategy. Returns blob object URL.
 * Caller MUST call URL.revokeObjectURL() when done to avoid memory leaks.
 *
 * Flow: Check cache → return blob URL if hit. Else fetch, store in cache, return blob URL.
 *
 * @param {string} url - HTTP/HTTPS URL (returns as-is if already blob:)
 * @returns {Promise<string>} Object URL (blob:...)
 * @throws {Error} On failed fetch
 */
export async function fetchAndCacheAsset(url) {
  if (!url || url.startsWith('blob:')) return url
  const cache = await openCache()
  if (cache) {
    try {
      const cached = await cache.match(url)
      if (cached) {
        const blob = await cached.blob()
        return URL.createObjectURL(blob)
      }
    } catch (_) {
      /* cache miss or error — fall through to network */
    }
  }
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const blob = await res.blob()
  if (cache) {
    try {
      await cache.put(url, new Response(blob))
    } catch (_) {
      /* cache write failed — non-fatal */
    }
  }
  return URL.createObjectURL(blob)
}

/**
 * Fetches a URL as a Blob and returns an object URL. No caching.
 * @param {string} url - HTTP/HTTPS URL (ignored if already blob:)
 * @returns {Promise<string>} Object URL (blob:...)
 */
export async function fetchAsBlobUrl(url) {
  if (!url || url.startsWith('blob:')) return url
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/**
 * Alias for fetchAndCacheAsset. Fetches URL with cache-first, returns blob URL.
 * Caller must revoke the URL when done.
 * @param {string} url - HTTP/HTTPS URL (ignored if already blob:)
 * @returns {Promise<string>} Object URL (blob:...)
 */
export const fetchAsBlobUrlWithCache = fetchAndCacheAsset

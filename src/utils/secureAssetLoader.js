/**
 * IP Protection: Fetch assets as Blobs served via temporary object URLs.
 *
 * Caching strategy — IN-MEMORY ONLY (module-level Map):
 *   - Assets cache for the current page session (survives React re-renders).
 *   - On page close / reload everything is gone — nothing persists in
 *     DevTools Application → Cache Storage.
 *   - Previous versions used the browser Cache API; that data is purged
 *     once on first load (see cleanup block below).
 *
 * R2: bucket CORS must allow this app origin (GET). See r2-cors.example.json.
 */

// ── In-memory blob store — url → Blob ────────────────────────────────────────
// Deliberately NOT using the browser Cache API: persistent caches appear in
// DevTools → Application → Cache Storage and are enumerable + downloadable
// by anyone with DevTools open.
const memCache = new Map()

// ── One-time cleanup of legacy persistent Cache API entries ──────────────────
// Removes 'stage-visualizer-assets-vN' caches left by older builds so
// previously cached files are no longer accessible in DevTools.
if (typeof caches !== 'undefined') {
  caches.keys()
    .then((names) => {
      names
        .filter((n) => n.startsWith('stage-visualizer-assets'))
        .forEach((n) => caches.delete(n))
    })
    .catch(() => {})
}

/**
 * Fetch a URL with session-scoped in-memory cache. Returns a blob object URL.
 * Caller MUST call URL.revokeObjectURL() when done to free memory.
 *
 * Flow: Check memCache → serve fresh blob URL if hit (no new network request).
 *       On miss → fetch, store Blob in memCache, return blob URL.
 *
 * @param {string} url - HTTP/HTTPS URL (returned as-is if already blob:)
 * @returns {Promise<string>} Object URL (blob:...)
 * @throws {Error} On failed fetch
 */
export async function fetchAndCacheAsset(url) {
  if (!url || url.startsWith('blob:')) return url

  if (memCache.has(url)) {
    // Return a fresh object URL from the cached Blob — the previous URL may
    // have been revoked by Scene.jsx after GPU upload.
    return URL.createObjectURL(memCache.get(url))
  }

  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const blob = await res.blob()
  memCache.set(url, blob)
  return URL.createObjectURL(blob)
}

/**
 * Fetch a URL as a Blob and return an object URL. No caching.
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

/** Alias for fetchAndCacheAsset. */
export const fetchAsBlobUrlWithCache = fetchAndCacheAsset

/**
 * Remove a specific URL from the in-memory cache (e.g. when a project closes).
 * Does not revoke any outstanding object URLs derived from the blob.
 */
export function evictFromCache(url) {
  memCache.delete(url)
}

/**
 * Clear the entire in-memory cache. Call on project switch to free memory.
 */
export function clearMemCache() {
  memCache.clear()
}

/**
 * IP Protection: Fetch assets as Blobs and serve via temporary object URLs.
 * Prevents direct URL exposure to loaders. Caller must revoke URLs after load.
 */

/**
 * Fetches a URL as a Blob and returns an object URL. Caller must revoke when done.
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

/**
 * LQIP (Low-Quality Image Placeholder) generation.
 *
 * Big stills can't stream — a texture needs the whole file before it paints. To
 * avoid a blank LED while a large image downloads, we generate a tiny inline
 * data URL at upload time and store it on the clip/source. The viewer shows this
 * blurry placeholder instantly, then swaps to the full-res image once it loads.
 *
 * The placeholder is a few hundred bytes, so it rides along in the playlist JSON
 * (no extra network request) and is decoded synchronously by the browser.
 */

const LQIP_MAX_DIM = 32
const LQIP_QUALITY = 0.5

function isImageFile(file) {
  if (!file) return false
  if ((file.type || '').startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name || '')
}

/**
 * Build a tiny JPEG data URL (≤ ~maxDim px on the long edge) from an image File.
 * Returns '' for non-images or on any failure — callers treat '' as "no LQIP".
 *
 * @param {File|Blob} file
 * @param {number} [maxDim]
 * @returns {Promise<string>}
 */
export async function generateLqip(file, maxDim = LQIP_MAX_DIM) {
  if (!isImageFile(file)) return ''
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return ''
  let bitmap = null
  try {
    bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height) || 1
    const scale = Math.min(1, maxDim / longest)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', LQIP_QUALITY)
  } catch {
    return ''
  } finally {
    bitmap?.close?.()
  }
}

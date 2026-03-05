import { useRef, useCallback, useEffect } from 'react'

/**
 * Safe blob URL cache for asset masking.
 * Blob URLs are only revoked when the project changes or the component unmounts,
 * NOT when switching between clips or when a texture/video finishes loading.
 * Prevents "dead blob" black screen when toggling back to a previously viewed asset.
 */
export function useBlobUrlCache() {
  const blobUrlsRef = useRef(new Set())

  const add = useCallback((url) => {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      blobUrlsRef.current.add(url)
    }
  }, [])

  const revokeAll = useCallback(() => {
    blobUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      } catch (_) {}
    })
    blobUrlsRef.current.clear()
  }, [])

  useEffect(() => {
    return revokeAll
  }, [revokeAll])

  return { add, revokeAll }
}

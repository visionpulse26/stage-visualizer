import { useState, useEffect, useCallback } from 'react'

const NAS_HDRI_LIST_URL = 'https://visual.tooawake.online/list_hdris.php'

const BUILTIN_PRESETS = [
  { id: 'none', label: 'Off', url: null, url_low: null },
]

export default function useHdriPresets() {
  const [presets, setPresets]   = useState(BUILTIN_PRESETS)
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetchPresets() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(NAS_HDRI_LIST_URL, { mode: 'cors' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        console.log('[useHdriPresets] Fetched HDRIs:', json)

        if (cancelled) return

        // API returns direct array: [{"name": "...", "url": "...", "url_low": "..."}, ...]
        const hdriArray = Array.isArray(json) ? json : (json.hdris || [])

        if (hdriArray.length > 0) {
          const nasPresets = hdriArray.map((h, idx) => ({
            id:      h.name || h.filename || `hdri-${idx}`,
            label:   (h.name || h.filename || `HDRI ${idx}`).replace(/\.[^/.]+$/, ''),
            url:     h.url,
            url_low: h.url_low || null,
          }))
          console.log('[useHdriPresets] Mapped presets:', nasPresets.length, 'items')
          setPresets([...BUILTIN_PRESETS, ...nasPresets])
        } else {
          console.warn('[useHdriPresets] Empty HDRI array received')
        }
      } catch (err) {
        console.error('[useHdriPresets] Failed to fetch NAS HDRIs:', err.message)
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPresets()
    return () => { cancelled = true }
  }, [])

  // Helper: find low-res fallback URL for a given high-res URL
  const findLowResUrl = useCallback((highResUrl) => {
    if (!highResUrl) return null
    const preset = presets.find(p => p.url === highResUrl)
    return preset?.url_low || null
  }, [presets])

  // LEGACY DATA SANITIZER: validate and fix URLs from old projects
  const validateUrl = useCallback((savedUrl) => {
    if (!savedUrl) return { valid: false, url: null }
    
    // Check if URL exists in current presets (exact match)
    const exactMatch = presets.find(p => p.url === savedUrl || p.url_low === savedUrl)
    if (exactMatch) return { valid: true, url: savedUrl, url_low: exactMatch.url_low }

    // LEGACY FIX: Sanitize old URL patterns
    let sanitizedFilename = savedUrl.split('/').pop()?.toLowerCase() || ''
    
    // Remove legacy suffixes like "_sm" (small), "_low", etc.
    sanitizedFilename = sanitizedFilename
      .replace(/_sm\.(hdr|exr)$/i, '.$1')
      .replace(/_low\.(hdr|exr)$/i, '.$1')
      .replace(/_high\.(hdr|exr)$/i, '.$1')
    
    // Try to find by sanitized filename
    if (sanitizedFilename) {
      const filenameMatch = presets.find(p => {
        const pFilename = p.url?.split('/').pop()?.toLowerCase()
        const pLowFilename = p.url_low?.split('/').pop()?.toLowerCase()
        // Match by base filename (without suffix)
        const baseFilename = sanitizedFilename.replace(/\.(hdr|exr)$/i, '')
        const pBase = pFilename?.replace(/\.(hdr|exr)$/i, '')
        const pLowBase = pLowFilename?.replace(/\.(hdr|exr)$/i, '')
        return pFilename === sanitizedFilename || 
               pLowFilename === sanitizedFilename ||
               pBase === baseFilename ||
               pLowBase === baseFilename
      })
      if (filenameMatch) {
        console.log('[HDRI Sanitizer] Legacy URL redirected:', savedUrl, '->', filenameMatch.url)
        return { valid: true, url: filenameMatch.url, url_low: filenameMatch.url_low }
      }
    }

    // LEGACY FIX: Try to reconstruct URL with new base path
    if (sanitizedFilename && sanitizedFilename.match(/\.(hdr|exr)$/i)) {
      const newUrl = `https://visual.tooawake.online/HDRIs/${sanitizedFilename}`
      const newUrlLow = `https://visual.tooawake.online/HDRIs_low/${sanitizedFilename}`
      console.log('[HDRI Sanitizer] Reconstructed legacy URL:', savedUrl, '->', newUrl)
      return { valid: true, url: newUrl, url_low: newUrlLow, reconstructed: true }
    }

    console.warn('[HDRI Sanitizer] Invalid URL (not found in presets):', savedUrl)
    return { valid: false, url: null }
  }, [presets])
  
  // Helper: get first valid preset for fallback
  const getFirstPreset = useCallback(() => {
    const firstValid = presets.find(p => p.url && p.id !== 'none')
    return firstValid || null
  }, [presets])

  return { presets, loading, error, findLowResUrl, validateUrl, getFirstPreset }
}

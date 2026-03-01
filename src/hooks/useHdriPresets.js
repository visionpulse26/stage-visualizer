import { useState, useEffect } from 'react'

const NAS_HDRI_LIST_URL = 'https://visual.tooawake.online/list_hdris.php'

const BUILTIN_PRESETS = [
  { id: 'none', label: 'Off', url: null },
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

        // API returns direct array: [{"name": "...", "url": "..."}, ...]
        const hdriArray = Array.isArray(json) ? json : (json.hdris || [])

        if (hdriArray.length > 0) {
          const nasPresets = hdriArray.map((h, idx) => ({
            id:    h.name || h.filename || `hdri-${idx}`,
            label: (h.name || h.filename || `HDRI ${idx}`).replace(/\.[^/.]+$/, ''),
            url:   h.url,
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

  return { presets, loading, error }
}

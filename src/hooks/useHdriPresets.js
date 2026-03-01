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
        const res = await fetch(NAS_HDRI_LIST_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        if (cancelled) return

        if (json.success && Array.isArray(json.hdris)) {
          const nasPresets = json.hdris.map(h => ({
            id:    h.name || h.filename,
            label: h.name || h.filename.replace(/\.[^/.]+$/, ''),
            url:   h.url,
          }))
          setPresets([...BUILTIN_PRESETS, ...nasPresets])
        } else {
          throw new Error(json.error || 'Invalid response')
        }
      } catch (err) {
        console.warn('[useHdriPresets] Failed to fetch NAS HDRIs:', err.message)
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

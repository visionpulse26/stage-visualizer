import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'stageviz:analytics-consent'

function readConsent() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'granted' || v === 'denied') return v
  } catch (_) { /* no-op */ }
  return null
}

function writeConsent(value) {
  try { localStorage.setItem(STORAGE_KEY, value) } catch (_) { /* no-op */ }
}

/**
 * Tri-state consent for guest analytics + name persistence on the public
 * `/view/:id` route. Server-side privacy controls (IP anonymization, retention)
 * are separate; this hook only gates client-side behavior.
 */
export function useAnalyticsConsent() {
  const [consent, setConsent] = useState(() => readConsent())

  const grant = useCallback(() => {
    writeConsent('granted')
    setConsent('granted')
  }, [])

  const deny = useCallback(() => {
    writeConsent('denied')
    setConsent('denied')
  }, [])

  useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key === STORAGE_KEY) setConsent(readConsent())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { consent, grant, deny, isUnset: consent === null }
}

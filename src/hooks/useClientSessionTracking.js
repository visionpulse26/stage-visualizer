/**
 * Client session & clip watch tracking.
 * - Session: start on mount, flush duration via visibilitychange (keepalive fetch) + heartbeat.
 * - Uses visibilitychange (not just beforeunload) so tab switches send reliably.
 * - Heartbeat at 5s (first) then every 30s — short sessions get data before throttling.
 * - Duration in SECONDS (matches backend duration_seconds).
 */

import { useEffect, useRef, useCallback } from 'react'
import {
  getOrCreateSessionId,
  recordClientSessionStart,
  recordClientSessionEnd,
  recordClipWatch,
} from '../lib/analyticsTracker'

const HEARTBEAT_INTERVAL_MS = 30000
const FIRST_HEARTBEAT_MS = 5000

export function useClientSessionTracking(projectId) {
  const sessionStartRef = useRef(null)
  const clipWatchRef = useRef({ clipKey: null, startAt: 0 })
  const flushedRef = useRef(false)

  const flushClipWatch = useCallback(() => {
    if (!projectId) return
    const { clipKey, startAt } = clipWatchRef.current
    if (!clipKey || !startAt) return
    const sec = (Date.now() - startAt) / 1000
    if (sec >= 1) recordClipWatch(projectId, clipKey, sec)
    clipWatchRef.current = { clipKey: null, startAt: 0 }
  }, [projectId])

  const startClipWatch = useCallback(
    (clipKey) => {
      if (!projectId || !clipKey) return
      flushClipWatch()
      clipWatchRef.current = { clipKey: String(clipKey).trim() || 'Unknown', startAt: Date.now() }
    },
    [projectId, flushClipWatch]
  )

  const stopClipWatch = useCallback(() => {
    flushClipWatch()
  }, [flushClipWatch])

  useEffect(() => {
    if (!projectId) return
    const sessionId = getOrCreateSessionId()
    sessionStartRef.current = Date.now()
    flushedRef.current = false
    recordClientSessionStart(projectId, sessionId)

    const flushSession = () => {
      if (flushedRef.current) return
      flushedRef.current = true
      flushClipWatch()
      const durationSec = (Date.now() - sessionStartRef.current) / 1000
      recordClientSessionEnd(projectId, sessionId, durationSec)
    }

    const handleUnload = () => {
      flushSession()
    }

    // First heartbeat at 5s (catches short visits before tab throttling)
    const firstHb = setTimeout(() => {
      const durationSec = (Date.now() - sessionStartRef.current) / 1000
      recordClientSessionEnd(projectId, sessionId, durationSec)
    }, FIRST_HEARTBEAT_MS)

    // Then every 30s (background tabs may throttle; visibilitychange covers tab switch)
    const heartbeat = setInterval(() => {
      const durationSec = (Date.now() - sessionStartRef.current) / 1000
      recordClientSessionEnd(projectId, sessionId, durationSec)
    }, HEARTBEAT_INTERVAL_MS)

    // Critical: visibilitychange fires on tab switch — more reliable than beforeunload alone
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleUnload()
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearTimeout(firstHb)
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flushSession()
    }
  }, [projectId, flushClipWatch])

  return { startClipWatch, stopClipWatch }
}

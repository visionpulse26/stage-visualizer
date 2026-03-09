/**
 * Client session & clip watch tracking.
 * - Session: start on mount, flush duration on beforeunload (Beacon/fetch keepalive)
 * - Clip watch: stopwatch per clip, flush on clip change or unload
 */

import { useEffect, useRef, useCallback } from 'react'
import {
  getOrCreateSessionId,
  recordClientSessionStart,
  recordClientSessionEnd,
  recordClipWatch,
} from '../lib/analyticsTracker'

export function useClientSessionTracking(projectId) {
  const sessionStartRef = useRef(null)
  const clipWatchRef = useRef({ clipKey: null, startAt: 0 })

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
    recordClientSessionStart(projectId, sessionId)

    const flushSession = () => {
      flushClipWatch()
      const duration = (Date.now() - sessionStartRef.current) / 1000
      recordClientSessionEnd(projectId, sessionId, duration)
    }

    const handleUnload = () => {
      flushSession()
    }

    // Heartbeat: update duration every 30s (partial data even if unload never fires)
    const heartbeat = setInterval(() => {
      const duration = (Date.now() - sessionStartRef.current) / 1000
      recordClientSessionEnd(projectId, sessionId, duration)
    }, 30000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleUnload()
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flushSession()
    }
  }, [projectId, flushClipWatch])

  return { startClipWatch, stopClipWatch }
}

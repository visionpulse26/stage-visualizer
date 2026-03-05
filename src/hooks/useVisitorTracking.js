import { useRef, useEffect, useCallback } from 'react'
import {
  getOrCreateSessionId,
  logUserEvent,
  logVisitorEntry,
  subscribePresence,
} from '../lib/analyticsTracker'

/**
 * Stealth tracking for Client/Collab pages.
 * - On mount: session_id (sessionStorage), insert visitor_logs, join presence channel.
 * - Returns logUserEvent(eventType, detail) for granular events (fire-and-forget).
 * - On unmount: log SESSION_END with duration, leave presence.
 */
export function useVisitorTracking(pageVisited) {
  const sessionIdRef = useRef(null)
  const sessionStartRef = useRef(Date.now())
  const leavePresenceRef = useRef(null)

  const log = useCallback((eventType, detail = {}) => {
    if (sessionIdRef.current) {
      logUserEvent(sessionIdRef.current, eventType, detail)
    }
  }, [])

  useEffect(() => {
    const sessionId = getOrCreateSessionId()
    sessionIdRef.current = sessionId
    sessionStartRef.current = Date.now()
    logVisitorEntry(sessionId, pageVisited)
    leavePresenceRef.current = subscribePresence(sessionId, pageVisited)

    return () => {
      const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000)
      logUserEvent(sessionId, 'SESSION_END', { timestamp: Date.now(), durationSeconds })
      if (leavePresenceRef.current) leavePresenceRef.current()
      sessionIdRef.current = null
    }
  }, [pageVisited])

  return { logUserEvent: log, sessionIdRef }
}

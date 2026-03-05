import { useEffect, useCallback, useRef } from 'react'
import {
  getOrCreateSessionId,
  incrementProjectStat,
  incrementProjectJsonbKey,
  subscribePresence,
} from '../lib/analyticsTracker'
import { flushNow } from '../lib/trackingService'

/**
 * Aggregate stats tracking for Client/Collab pages.
 * - On mount: increment total_views, join presence channel.
 * - Returns incrementStat(statName), incrementJsonb(columnName, key).
 */
export function useProjectStats(projectId, pageLabel = 'client') {
  const leavePresenceRef = useRef(null)

  const incrementStat = useCallback((statName) => {
    if (projectId) incrementProjectStat(projectId, statName)
  }, [projectId])

  const incrementJsonb = useCallback((columnName, key) => {
    if (projectId) incrementProjectJsonbKey(projectId, columnName, key)
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    const sessionId = getOrCreateSessionId()
    const pageVisited = `${pageLabel}/${projectId}`
    leavePresenceRef.current = subscribePresence(sessionId, pageVisited)
    // total_views is now incremented from ClientPage/CollabPage after project loads
    const onUnload = () => { flushNow() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (leavePresenceRef.current) leavePresenceRef.current()
    }
  }, [projectId, pageLabel])

  return { incrementStat, incrementJsonb }
}

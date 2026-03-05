import { useEffect, useCallback, useRef } from 'react'
import {
  getOrCreateSessionId,
  incrementProjectStat,
  subscribePresence,
} from '../lib/analyticsTracker'

/**
 * Aggregate stats tracking for Client/Collab pages.
 * - On mount: increment total_views, join presence channel.
 * - Returns incrementStat(statName) for: total_screenshots, total_camera_changes, total_clip_clicks.
 * - Fire-and-forget; does not block UI.
 */
export function useProjectStats(projectId, pageLabel = 'client') {
  const leavePresenceRef = useRef(null)

  const incrementStat = useCallback((statName) => {
    if (projectId) incrementProjectStat(projectId, statName)
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    const sessionId = getOrCreateSessionId()
    const pageVisited = `${pageLabel}/${projectId}`
    leavePresenceRef.current = subscribePresence(sessionId, pageVisited)
    incrementProjectStat(projectId, 'total_views')
    return () => {
      if (leavePresenceRef.current) leavePresenceRef.current()
    }
  }, [projectId, pageLabel])

  return { incrementStat }
}

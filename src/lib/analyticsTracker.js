/**
 * Stealth analytics: presence + aggregate stat increments.
 * Stats stored on projects table; anon increments via RPC.
 * total_views sent immediately (critical); other stats batched via TrackingService.
 */

import { supabase } from './supabaseClient'
import { trackStat, trackJsonb } from './trackingService'

const SESSION_STORAGE_KEY = 'stage_visitor_session_id'
export const REALTIME_CHANNEL_NAME = 'global_radar'

/** Get or create a persistent session ID (survives reloads in same tab). */
export function getOrCreateSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!id) {
      id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      sessionStorage.setItem(SESSION_STORAGE_KEY, id)
    }
    return id
  } catch {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}

/**
 * Increment integer stat. total_views: awaited + one retry so metrics reliably update.
 * Others go through batched TrackingService.
 */
export function incrementProjectStat(projectId, statName) {
  if (!projectId || !statName) return
  if (statName === 'total_views') {
    incrementTotalViewsOnce(projectId).catch(() => {})
    return
  }
  trackStat(projectId, statName)
}

/** Awaited call with one retry — ensures view count is persisted. */
async function incrementTotalViewsOnce(projectId) {
  const run = async () => {
    const { error } = await supabase.rpc('increment_project_stat', {
      p_project_id: projectId,
      p_stat_name: 'total_views',
    })
    if (error) throw new Error(error.message)
  }
  try {
    await run()
  } catch (e) {
    await new Promise((r) => setTimeout(r, 600))
    try {
      await run()
    } catch (e2) {
      console.warn('[Analytics] total_views failed:', e2?.message || e2)
    }
  }
}

/** Increment JSONB key. Delegates to TrackingService (batched + debounced). */
export function incrementProjectJsonbKey(projectId, columnName, key) {
  trackJsonb(projectId, columnName, key)
}

/** Subscribe to presence channel; returns cleanup function. */
export function subscribePresence(sessionId, pageVisited) {
  const channel = supabase.channel(REALTIME_CHANNEL_NAME)
  channel
    .on('presence', { event: 'sync' }, () => {})
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          session_id: sessionId,
          status: 'online',
          page_visited: pageVisited,
          updated_at: new Date().toISOString(),
        })
      }
    })
  return () => {
    channel.untrack().then(() => supabase.removeChannel(channel))
  }
}

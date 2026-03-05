/**
 * Stealth analytics: presence + aggregate stat increments.
 * Stats stored on projects table; anon increments via RPC.
 */

import { supabase } from './supabaseClient'

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

/** Increment a project stat. Fire-and-forget; does not block UI. */
export function incrementProjectStat(projectId, statName) {
  if (!projectId || !statName) return
  supabase
    .rpc('increment_project_stat', { p_project_id: projectId, p_stat_name: statName })
    .then(() => {})
    .catch(() => {})
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

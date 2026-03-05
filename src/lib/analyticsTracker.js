/**
 * Stealth analytics: session ID, visitor log, and fire-and-forget event logging.
 * Data is only readable by authenticated Admins via RLS.
 */

import { supabase } from './supabaseClient'

const SESSION_STORAGE_KEY = 'stage_visitor_session_id'
const REALTIME_CHANNEL_NAME = 'global_radar'

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
 * Log a granular event. Fire-and-forget: does not block UI or await.
 */
export function logUserEvent(sessionId, eventType, detail = {}) {
  if (!sessionId) return
  supabase
    .from('interaction_events')
    .insert({
      session_id: sessionId,
      event_type: eventType,
      event_detail: typeof detail === 'object' ? detail : { value: detail },
    })
    .then(() => {})
    .catch(() => {})
}

/**
 * Insert initial visitor log row. Fire-and-forget.
 */
export function logVisitorEntry(sessionId, pageVisited) {
  if (!sessionId) return
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  supabase
    .from('visitor_logs')
    .insert({
      session_id: sessionId,
      user_agent: userAgent,
      page_visited: pageVisited,
    })
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

export { REALTIME_CHANNEL_NAME }

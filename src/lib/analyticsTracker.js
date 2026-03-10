/**
 * Stealth analytics: presence + aggregate stat increments.
 * Client page views: simple INSERT into client_page_views (no RPC, works with any id type).
 */

import { supabase, supabaseUrl, supabaseKey } from './supabaseClient'
import { trackStat, trackJsonb } from './trackingService'

/** Record one client page view. Uses client_page_views table — no RPC, no projects table. */
export function recordClientPageView(projectId) {
  if (!projectId) return
  const id = String(projectId).trim()
  if (!id) return
  supabase
    .from('client_page_views')
    .insert({ project_id: id, viewed_at: new Date().toISOString() })
    .then(({ error }) => { if (error) console.warn('[Analytics] recordClientPageView:', error.message) })
    .catch((e) => console.warn('[Analytics] recordClientPageView:', e))
}

/**
 * Robust OS detection. Returns one of: "iOS", "Android", "macOS", "Windows", "Other".
 * Fixes "Desktop Safari on iPhone/iPad" bug: when iOS requests desktop site, UA reports
 * as Mac. If UA says "Mac" but maxTouchPoints > 0, it is iOS/iPadOS, not macOS.
 * Prioritizes mobile (iOS/Android) before desktop.
 */
export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'Other'
  const ua = navigator.userAgent || ''
  const maxTouchPoints = navigator.maxTouchPoints ?? 0

  // 1. Explicit iPhone/iPad (unmasked)
  if (/iPhone|iPod/i.test(ua)) return 'iOS'
  if (/iPad/i.test(ua)) return 'iOS'

  // 2. Mac-like UA with touch → iOS (iPad/iPhone requesting desktop site)
  if ((/Macintosh|Mac OS X/i.test(ua) || /Mac Intel/i.test(ua)) && maxTouchPoints > 0) {
    return 'iOS'
  }

  // 3. Android (mobile)
  if (/Android/i.test(ua)) return 'Android'

  // 4. Desktop OS
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS X|Mac Intel/i.test(ua)) return 'macOS'

  // 5. Linux and others
  return 'Other'
}

/** Parse device context for session logging. Uses robust platform detection. */
export function parseDeviceContext() {
  const width = typeof window !== 'undefined' ? window.innerWidth : 0
  const height = typeof window !== 'undefined' ? window.innerHeight : 0
  const deviceOs = detectPlatform()
  const formFactor = width > 0 && width < 768 ? 'Mobile' : 'Desktop'
  return { deviceOs, formFactor, screenWidth: width, screenHeight: height }
}

/** Start a client session (device, screen). Call on page load. */
export function recordClientSessionStart(projectId, sessionId) {
  if (!projectId || !sessionId) return
  const pid = String(projectId).trim()
  if (!pid) return
  const { deviceOs, formFactor, screenWidth, screenHeight } = parseDeviceContext()
  supabase
    .from('client_sessions')
    .insert({
      project_id: pid,
      session_id: sessionId,
      device_os: deviceOs,
      form_factor: formFactor,
      screen_width: screenWidth || null,
      screen_height: screenHeight || null,
    })
    .then(({ error }) => { if (error) console.warn('[Analytics] recordClientSessionStart:', error.message) })
    .catch((e) => console.warn('[Analytics] recordClientSessionStart:', e))
}

/**
 * End a client session with duration. Uses RPC (SECURITY DEFINER) to bypass RLS.
 * fetch + keepalive for reliable delivery on visibilitychange/beforeunload.
 * Duration in SECONDS (matches backend duration_seconds).
 */
export function recordClientSessionEnd(projectId, sessionId, durationSeconds) {
  if (!projectId || !sessionId || typeof durationSeconds !== 'number' || durationSeconds < 0) return
  const pid = String(projectId).trim()
  if (!pid) return
  const url = (supabaseUrl || '').replace(/\/$/, '') + '/rest/v1/rpc/upsert_client_session'
  if (!url || !supabaseKey) return
  const durationSec = Math.round(durationSeconds)
  const { deviceOs, formFactor, screenWidth, screenHeight } = parseDeviceContext()
  const payload = {
    p_project_id: pid,
    p_session_id: sessionId,
    p_duration_seconds: durationSec,
    p_device_os: deviceOs || null,
    p_form_factor: formFactor || null,
    p_screen_width: screenWidth || null,
    p_screen_height: screenHeight || null,
  }
  try {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch (_) {}
}

/** Record clip watch segment (seconds watched). Call when user switches clip or on unload. */
export function recordClipWatch(projectId, clipKey, watchSeconds) {
  if (!projectId || !clipKey || typeof watchSeconds !== 'number' || watchSeconds <= 0) return
  const pid = String(projectId).trim()
  const key = String(clipKey).trim() || 'Unknown'
  if (!pid) return
  supabase
    .from('client_clip_watch')
    .insert({ project_id: pid, clip_key: key, watch_seconds: Math.round(watchSeconds) })
    .then(({ error }) => { if (error) console.warn('[Analytics] recordClipWatch:', error.message) })
    .catch((e) => console.warn('[Analytics] recordClipWatch:', e))
}

/** Record clip play, screenshot, or camera change. Uses client_interactions table — no RPC. */
export function recordClientInteraction(projectId, eventType, eventKey) {
  if (!projectId || !eventType || !eventKey) return
  const pid = String(projectId).trim()
  const key = String(eventKey).trim() || 'Unknown'
  if (!pid || !['clip_play', 'screenshot', 'camera_change'].includes(eventType)) return
  supabase
    .from('client_interactions')
    .insert({ project_id: pid, event_type: eventType, event_key: key })
    .then(({ error }) => { if (error) console.warn('[Analytics] recordClientInteraction:', error.message) })
    .catch((e) => console.warn('[Analytics] recordClientInteraction:', e))
}

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

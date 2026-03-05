/**
 * Batched analytics tracking for Stage Visualizer.
 * Queues events and flushes to Supabase RPC in batches to avoid:
 * - Event storms (e.g. camera orbit) overwhelming the API
 * - Silent failures from fire-and-forget
 * - Excessive round-trips
 */

import { supabase } from './supabaseClient'

const FLUSH_INTERVAL_MS = 2000
const FLUSH_MAX_ITEMS = 10
const DEBOUNCE_MS = 400

const VALID_STATS = new Set(['total_views', 'total_screenshots', 'total_camera_changes', 'total_clip_clicks'])
const VALID_JSONB = new Set(['clip_popularity', 'camera_popularity', 'screenshot_hotspots'])

// Per (projectId, type, key) last-sent timestamp for debounce
const lastSent = new Map()
const queue = []
let flushTimer = null

function queueKey(projectId, type, statOrCol, key = '') {
  if (type === 'stat') return `${projectId}|stat|${statOrCol}|`
  return `${projectId}|jsonb|${statOrCol}|${String(key)}`
}

function enqueue(projectId, type, statOrCol, key = '') {
  if (!projectId) return
  const k = queueKey(projectId, type, statOrCol, key)
  const now = Date.now()
  const last = lastSent.get(k) || 0
  if (now - last < DEBOUNCE_MS && queue.length > 0) {
    // Coalesce: find existing op and bump count (we'll send multiple increments)
    const idx = queue.findIndex(op => op.k === k)
    if (idx >= 0) {
      queue[idx].count = (queue[idx].count || 1) + 1
      return
    }
  }
  queue.push({ projectId, type, statOrCol, key, k, count: 1 })
  scheduleFlush()
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(doFlush, FLUSH_INTERVAL_MS)
}

async function doFlush() {
  flushTimer = null
  if (queue.length === 0) return

  const items = queue.splice(0, FLUSH_MAX_ITEMS)
  const byProject = new Map()

  for (const item of items) {
    if (!byProject.has(item.projectId)) byProject.set(item.projectId, [])
    const ops = byProject.get(item.projectId)

    if (item.type === 'stat') {
      for (let i = 0; i < (item.count || 1); i++) {
        ops.push({ type: 'stat', stat_name: item.statOrCol })
      }
    } else {
      for (let i = 0; i < (item.count || 1); i++) {
        ops.push({ type: 'jsonb', column: item.statOrCol, key: item.key })
      }
    }
    lastSent.set(item.k, Date.now())
  }

  for (const [projectId, ops] of byProject) {
    try {
      const { error } = await supabase.rpc('batch_increment_project_stats', {
        p_project_id: projectId,
        p_ops: ops,
      })
      if (error) {
        console.warn('[TrackingService] batch_increment failed:', error.message)
        // Fallback: try individual RPCs
        for (const op of ops) {
          if (op.type === 'stat') {
            await supabase.rpc('increment_project_stat', {
              p_project_id: projectId,
              p_stat_name: op.stat_name,
            })
          } else {
            await supabase.rpc('increment_project_jsonb_key', {
              p_project_id: projectId,
              p_column: op.column,
              p_key: op.key,
            })
          }
        }
      }
    } catch (err) {
      console.warn('[TrackingService] Error:', err)
    }
  }

  if (queue.length > 0) scheduleFlush()
}

/**
 * Increment integer stat (total_views, total_screenshots, etc).
 * Batched and debounced.
 */
export function trackStat(projectId, statName) {
  if (!projectId || !statName || !VALID_STATS.has(statName)) return
  enqueue(projectId, 'stat', statName, '')
}

/**
 * Increment JSONB key (clip_popularity, camera_popularity, screenshot_hotspots).
 * Batched and debounced. Use clip ID or name for "Most Viewed Clip"; camera ID/name for "Most Captured".
 */
export function trackJsonb(projectId, columnName, key) {
  if (!projectId || !columnName || !VALID_JSONB.has(columnName)) return
  const k = String(key || '').trim()
  if (!k) return
  enqueue(projectId, 'jsonb', columnName, k)
}

/**
 * Flush pending events immediately (e.g. before page unload).
 */
export function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  return doFlush()
}

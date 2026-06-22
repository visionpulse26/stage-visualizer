import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Soft advisory lock for the presentation editor.
 *
 * Uses Supabase Realtime Presence on channel `lock:presentation:{projectId}`.
 * One admin holds `editMode:'write'` at a time; others are `editMode:'read'`.
 *
 * Rules:
 *  - First to subscribe (earliest `lockedAt`) gets write.
 *  - If two join simultaneously, deterministic tiebreak: smaller userId string wins.
 *  - Lock holder sends a heartbeat every 25s so Supabase doesn't expire the presence.
 *  - When a tab closes, Supabase auto-removes presence → next admin auto-upgrades to write.
 *
 * Returns:
 *  { isReadOnly, lockHolder, requestWriteAccess, releaseWriteAccess }
 *
 * @param {string|null} projectId
 * @param {{ userId: string, email: string, displayName: string }|null} userInfo
 *   Must be stable across renders (useMemo at call site).
 */
export function useSoftLock(projectId, userInfo) {
  const [isReadOnly, setIsReadOnly]   = useState(false)
  const [lockHolder, setLockHolder]   = useState(null)
  const channelRef                    = useRef(null)
  const editModeRef                   = useRef('write')  // our current tracked mode
  const heartbeatRef                  = useRef(null)

  // ── helpers ──────────────────────────────────────────────────────────────────

  function pickWriter(presenceState) {
    const all = Object.values(presenceState).flat()
    const writers = all
      .filter(p => p.editMode === 'write')
      .sort((a, b) => {
        const dt = new Date(a.lockedAt).getTime() - new Date(b.lockedAt).getTime()
        if (dt !== 0) return dt
        return (a.userId ?? '').localeCompare(b.userId ?? '')
      })
    return writers[0] ?? null
  }

  const trackAs = useCallback(async (mode) => {
    const ch = channelRef.current
    if (!ch || !userInfo?.userId) return
    editModeRef.current = mode
    await ch.track({
      userId:      userInfo.userId,
      email:       userInfo.email,
      displayName: userInfo.displayName,
      editMode:    mode,
      lockedAt:    new Date().toISOString(),
    })
  }, [userInfo])

  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    heartbeatRef.current = setInterval(() => {
      // Re-track to prevent Supabase presence expiry (~60s default TTL)
      trackAs(editModeRef.current)
    }, 25_000)
  }, [trackAs])

  function stopHeartbeat() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }

  // ── effect ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId || !userInfo?.userId) return

    const channel = supabase.channel(`lock:presentation:${projectId}`, {
      config: { presence: { key: userInfo.userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const writer = pickWriter(state)

        if (!writer) {
          // No one holds write — we take it (can happen after holder leaves)
          setLockHolder(null)
          setIsReadOnly(false)
          trackAs('write')
          return
        }

        setLockHolder(writer)
        setIsReadOnly(writer.userId !== userInfo.userId)
      })
      .on('broadcast', { event: 'lock_takeover' }, ({ payload }) => {
        // Someone is forcibly taking our write lock
        if (payload?.takenFrom === userInfo.userId) {
          trackAs('read')
          setIsReadOnly(true)
        }
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return

        // Determine initial mode: yield to any existing writer
        const state = channel.presenceState()
        const existingWriter = pickWriter(state)
        const weAreWriter = !existingWriter || existingWriter.userId === userInfo.userId

        await trackAs(weAreWriter ? 'write' : 'read')
        startHeartbeat()
      })

    channelRef.current = channel

    return () => {
      stopHeartbeat()
      channel.untrack()
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userInfo?.userId])

  // ── public API ───────────────────────────────────────────────────────────────

  const requestWriteAccess = useCallback(async () => {
    const ch = channelRef.current
    if (!ch || !userInfo?.userId) return

    // Notify current holder they're losing write
    if (lockHolder?.userId && lockHolder.userId !== userInfo.userId) {
      await ch.send({
        type:    'broadcast',
        event:   'lock_takeover',
        payload: { takenFrom: lockHolder.userId, takenBy: userInfo.userId },
      })
    }

    await trackAs('write')
    setIsReadOnly(false)
  }, [lockHolder, trackAs, userInfo?.userId])

  const releaseWriteAccess = useCallback(async () => {
    await trackAs('read')
    setIsReadOnly(true)
  }, [trackAs])

  return { isReadOnly, lockHolder, requestWriteAccess, releaseWriteAccess }
}

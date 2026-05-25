import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Real-time collaborative slide editing via Supabase Realtime broadcast.
 *
 * Broadcasts slide operations to all other admins on the same presentation.
 * Receives remote ops and calls onApplyOp so the caller can update local state.
 *
 * Operation types:
 *   slide_update   { slideId, patch }
 *   slide_add      { slide }
 *   slide_delete   { slideId }
 *   slide_reorder  { dragId, dropId }
 *
 * @param {string|null} projectId
 * @param {{ userId: string, email: string, displayName: string }|null} userInfo
 * @param {(op: object) => void} onApplyOp  — called when a remote op arrives; must be stable (useCallback)
 */
export function useCollaborativeEditing(projectId, userInfo, onApplyOp) {
  const channelRef    = useRef(null)
  const onApplyOpRef  = useRef(onApplyOp)

  useEffect(() => { onApplyOpRef.current = onApplyOp }, [onApplyOp])

  useEffect(() => {
    if (!projectId) return

    const channel = supabase
      .channel(`collab:presentation:${projectId}`)
      .on('broadcast', { event: 'slide_op' }, ({ payload }) => {
        // Ignore ops we sent ourselves (channel echoes back on some configs)
        if (payload?.by === userInfo?.userId) return
        if (payload?.op) onApplyOpRef.current(payload.op)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  // userInfo.userId intentionally used as dep to avoid re-subscribing on display name changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userInfo?.userId])

  const broadcastOp = useCallback(async (op) => {
    const ch = channelRef.current
    if (!ch || !op) return
    await ch.send({
      type:    'broadcast',
      event:   'slide_op',
      payload: { by: userInfo?.userId, op },
    })
  }, [userInfo?.userId])

  return { broadcastOp }
}

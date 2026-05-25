import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Join a Supabase Realtime Presence channel for a presentation.
 * Returns the list of all users currently on the same page.
 *
 * @param {string|null} projectId
 * @param {{ userId: string, email: string, displayName: string }|null} userInfo
 *   Must be referentially stable (useMemo at call site) to avoid re-subscribing.
 */
export function usePresenceChannel(projectId, userInfo) {
  const [presenceList, setPresenceList] = useState([])
  const channelRef = useRef(null)

  useEffect(() => {
    if (!projectId || !userInfo?.userId) return

    const channel = supabase.channel(`presence:presentation:${projectId}`, {
      config: { presence: { key: userInfo.userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // presenceState() → { [key]: [{ ...payload }] } — flat to get all entries
        setPresenceList(Object.values(state).flat())
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({
          userId: userInfo.userId,
          email: userInfo.email,
          displayName: userInfo.displayName,
          joinedAt: new Date().toISOString(),
        })
      })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  // userInfo.userId intentionally used as dep instead of the whole object
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userInfo?.userId])

  return { presenceList }
}

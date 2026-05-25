import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Subscribe to Postgres changes on presentation_versions for a project.
 * Calls onRemoteSave(newRow) when another admin saves the draft (version_token changes).
 *
 * @param {string|null} projectId
 * @param {string|null} currentVersionToken  — the token this client loaded; kept in a ref so
 *   the callback always compares against the latest value without re-subscribing.
 * @param {(newRow: object) => void} onRemoteSave — should be a stable useCallback
 */
export function useVersionWatcher(projectId, currentVersionToken, onRemoteSave) {
  const tokenRef = useRef(currentVersionToken)
  const onRemoteSaveRef = useRef(onRemoteSave)

  useEffect(() => { tokenRef.current = currentVersionToken }, [currentVersionToken])
  useEffect(() => { onRemoteSaveRef.current = onRemoteSave }, [onRemoteSave])

  useEffect(() => {
    if (!projectId) return

    const channel = supabase
      .channel(`db:presentation_versions:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'presentation_versions',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newRow = payload.new
          // Only notify when the token changed relative to what we have loaded
          if (newRow?.version_token && newRow.version_token !== tokenRef.current) {
            onRemoteSaveRef.current(newRow)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])
}

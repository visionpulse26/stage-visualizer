import { useEffect } from 'react'

/**
 * IP Protection: Deterrents for Client and Collab pages.
 * Disables right-click and blocks common DevTools / view-source shortcuts.
 * Note: Determined users can bypass these; they deter casual inspection only.
 */
export function useSecurityLockdown() {
  useEffect(() => {
    const preventContextMenu = (e) => e.preventDefault()

    const blockDevToolsShortcuts = (e) => {
      const f12 = e.key === 'F12'
      const devTools = e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')
      const viewSource = e.ctrlKey && e.key === 'u'
      if (f12 || devTools || viewSource) {
        e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', preventContextMenu)
    document.addEventListener('keydown', blockDevToolsShortcuts)

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('keydown', blockDevToolsShortcuts)
    }
  }, [])
}

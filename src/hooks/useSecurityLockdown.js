import { useEffect, useRef } from 'react'

/**
 * IP Protection: Deterrents for Client and Collab pages.
 * Disables right-click, blocks dev tools shortcuts, and adds debugger trap.
 * Note: Determined users can bypass these; they deter casual inspection.
 */
export function useSecurityLockdown() {
  const trapRef = useRef(null)

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

    trapRef.current = setInterval(() => {
      // eslint-disable-next-line no-debugger
      debugger
    }, 100)

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('keydown', blockDevToolsShortcuts)
      if (trapRef.current) clearInterval(trapRef.current)
    }
  }, [])
}

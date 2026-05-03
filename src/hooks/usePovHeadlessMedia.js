import { useEffect, useRef } from 'react'

/**
 * EPIC #1 P4 — When pointer lock is on the WebGL canvas (POV), drive media without the side panel.
 * Q / E — previous / next playlist clip
 * 1–9   — jump to slot (1 = first item)
 * P     — screenshot (host supplies callback)
 */
export function usePovHeadlessMedia({
  active,
  glDomElementRef,
  videoPlaylist = [],
  activeVideoId,
  onActivateClip,
  onScreenshot,
}) {
  const playlistRef = useRef(videoPlaylist)
  const activeIdRef = useRef(activeVideoId)
  const onClipRef = useRef(onActivateClip)
  const onShotRef = useRef(onScreenshot)

  useEffect(() => {
    playlistRef.current = videoPlaylist
  }, [videoPlaylist])
  useEffect(() => {
    activeIdRef.current = activeVideoId
  }, [activeVideoId])
  useEffect(() => {
    onClipRef.current = onActivateClip
  }, [onActivateClip])
  useEffect(() => {
    onShotRef.current = onScreenshot
  }, [onScreenshot])

  useEffect(() => {
    if (!active) return

    const isTypingTarget = (t) => {
      if (!t) return false
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (t.isContentEditable) return true
      return false
    }

    const onKeyDown = (ev) => {
      if (isTypingTarget(ev.target)) return
      const canvas = glDomElementRef?.current
      if (!canvas || document.pointerLockElement !== canvas) return
      if (ev.repeat) return

      const list = playlistRef.current || []
      const cur = list.findIndex((c) => c.id === activeIdRef.current)

      if (ev.code === 'KeyQ') {
        if (list.length === 0) return
        ev.preventDefault()
        const idx = cur <= 0 ? list.length - 1 : cur - 1
        onClipRef.current?.(list[idx])
        return
      }
      if (ev.code === 'KeyE') {
        if (list.length === 0) return
        ev.preventDefault()
        const idx = cur < 0 ? 0 : (cur + 1) % list.length
        onClipRef.current?.(list[idx])
        return
      }
      if (ev.code >= 'Digit1' && ev.code <= 'Digit9') {
        const n = Number(ev.code.replace('Digit', '')) - 1
        const clip = list[n]
        if (clip) {
          ev.preventDefault()
          onClipRef.current?.(clip)
        }
        return
      }
      if (ev.code === 'KeyP' && onShotRef.current) {
        ev.preventDefault()
        onShotRef.current()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, glDomElementRef])
}

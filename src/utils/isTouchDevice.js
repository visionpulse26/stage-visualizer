/** Coarse pointer = typical phones/tablets — POV PointerLock not reliable there (Phase 1). */
export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

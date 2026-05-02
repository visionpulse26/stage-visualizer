import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { usePovController } from '../hooks/usePovController'

/**
 * Epic 1 Phase 2 — runs inside &lt;Canvas&gt;. Applies FPS tick + pointer-lock hint overlay.
 */
export function PovFpsRig({ enabled, floorY, geofenceBox, geofencePadding = 0 }) {
  const { camera, gl } = useThree()
  const { tick } = usePovController({
    enabled,
    camera,
    gl,
    floorY,
    geofenceBox,
    geofencePadding,
  })

  useFrame((_, delta) => {
    if (enabled) tick(delta)
  })

  const [locked, setLocked] = useState(() => document.pointerLockElement === gl.domElement)
  useEffect(() => {
    const el = gl.domElement
    const sync = () => setLocked(document.pointerLockElement === el)
    document.addEventListener('pointerlockchange', sync)
    sync()
    return () => document.removeEventListener('pointerlockchange', sync)
  }, [gl])

  if (!enabled) return null

  if (locked) return null

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div className="flex h-full w-full items-center justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            gl.domElement.requestPointerLock?.()
          }}
          className="pointer-events-auto px-5 py-3 rounded-2xl border border-white/20 bg-black/70 backdrop-blur-md text-[11px] font-semibold uppercase tracking-widest text-white/85 hover:bg-black/85 hover:border-violet-500/40 transition-all"
          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
        >
          Click to capture mouse · WASD · Esc to exit POV
        </button>
      </div>
    </Html>
  )
}

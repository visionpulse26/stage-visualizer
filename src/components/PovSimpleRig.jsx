import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { usePovController } from '../hooks/usePovController'

function PovSimpleTicker({ enabled, floorY, geofenceBox, geofencePadding, gl }) {
  const { camera } = useThree()
  const { tick } = usePovController({
    enabled,
    camera,
    gl,
    floorY,
    geofenceBox,
    geofencePadding,
  })

  useFrame((_, delta) => {
    tick(delta)
  })

  return null
}

export function PovSimpleRig({ enabled, floorY, geofenceBox, geofencePadding = 0 }) {
  const { gl } = useThree()
  const [locked, setLocked] = useState(() => document.pointerLockElement === gl.domElement)

  useEffect(() => {
    if (!enabled) return
    gl.domElement.requestPointerLock?.()
  }, [enabled, gl])

  useEffect(() => {
    const el = gl.domElement
    const sync = () => setLocked(document.pointerLockElement === el)
    document.addEventListener('pointerlockchange', sync)
    sync()
    return () => document.removeEventListener('pointerlockchange', sync)
  }, [gl])

  if (!enabled) return null

  return (
    <>
      <PovSimpleTicker
        enabled={enabled}
        floorY={floorY}
        geofenceBox={geofenceBox}
        geofencePadding={geofencePadding}
        gl={gl}
      />

      {!locked && (
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
              Click to capture mouse · WASD move · Q/E clips · 1-9 slot · P screenshot · Esc exit POV
            </button>
          </div>
        </Html>
      )}
    </>
  )
}

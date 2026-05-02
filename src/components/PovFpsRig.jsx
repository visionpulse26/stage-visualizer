import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Suspense, useEffect, useState } from 'react'
import { Physics } from '@react-three/rapier'
import { PovStageColliders } from './pov/PovStageColliders'
import { PovKinematicDriver } from './pov/PovKinematicDriver'

/**
 * Epic 1 Phase 2–3 — POV inside Rapier (floor + geofence walls) + pointer-lock overlay.
 */
export function PovFpsRig({ enabled, floorY, geofenceBox, geofencePadding = 0, stageColliders = [] }) {
  const { gl } = useThree()

  const [locked, setLocked] = useState(() => document.pointerLockElement === gl.domElement)
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
      <Suspense fallback={null}>
        <Physics gravity={[0, 0, 0]} timeStep={1 / 60} interpolate={false}>
          <PovStageColliders
            geofenceBox={geofenceBox}
            geofencePadding={geofencePadding}
            stageColliders={stageColliders}
          />
          <PovKinematicDriver
            enabled={enabled}
            floorY={floorY}
            geofenceBox={geofenceBox}
            geofencePadding={geofencePadding}
            gl={gl}
          />
        </Physics>
      </Suspense>

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
              Click to capture mouse · WASD · Esc to exit POV
            </button>
          </div>
        </Html>
      )}
    </>
  )
}

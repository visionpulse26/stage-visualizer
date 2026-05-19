import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Suspense, useEffect, useState } from 'react'
import { Physics } from '@react-three/rapier'
import { PovStageColliders } from './pov/PovStageColliders'
import { PovKinematicDriver } from './pov/PovKinematicDriver'
import { PovDebugOverlay } from './pov/PovDebugOverlay'

/**
 * Epic 1 Phase 2–3 — POV inside Rapier (floor + geofence walls) + pointer-lock overlay.
 */
export function PovFpsRig({
  enabled,
  floorY,
  geofenceBox,
  geofencePadding = 0,
  stageColliders = [],
  debugEnabled = false,
}) {
  const { gl } = useThree()
  const [lockWarning, setLockWarning] = useState('')

  const [locked, setLocked] = useState(() => document.pointerLockElement === gl.domElement)
  useEffect(() => {
    const el = gl.domElement
    const sync = () => setLocked(document.pointerLockElement === el)
    document.addEventListener('pointerlockchange', sync)
    sync()
    return () => document.removeEventListener('pointerlockchange', sync)
  }, [gl])

  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement
    const requestLock = () => {
      setLockWarning('')
      try {
        const result = el.requestPointerLock?.()
        if (result?.catch) {
          result.catch((err) => {
            console.warn('[POV] pointer lock denied', err)
            setLockWarning('Browser denied mouse capture. Click the stage again, or try Chrome.')
          })
        }
      } catch (err) {
        console.warn('[POV] pointer lock denied', err)
        setLockWarning('Browser denied mouse capture. Click the stage again, or try Chrome.')
      }
    }
    const handlePointerLockError = () => {
      setLockWarning('Browser denied mouse capture. Click the stage again, or try Chrome.')
    }
    el.addEventListener('click', requestLock)
    document.addEventListener('pointerlockerror', handlePointerLockError)
    return () => {
      el.removeEventListener('click', requestLock)
      document.removeEventListener('pointerlockerror', handlePointerLockError)
    }
  }, [enabled, gl])

  return (
    <>
      <Suspense fallback={null}>
        <Physics gravity={[0, -18, 0]} timeStep={1 / 60} interpolate={false} paused={!enabled}>
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
            stageColliders={stageColliders}
          />
          {debugEnabled && (
            <PovDebugOverlay
              stageColliders={stageColliders}
              geofenceBox={geofenceBox}
              geofencePadding={geofencePadding}
            />
          )}
        </Physics>
      </Suspense>

      {enabled && !locked && (
        <Html fullscreen style={{ pointerEvents: 'none' }}>
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="px-5 py-3 rounded-2xl border border-white/20 bg-black/70 backdrop-blur-md text-center text-[11px] font-semibold uppercase tracking-widest text-white/85"
              style={{ fontFamily: "'Chakra Petch', sans-serif" }}
            >
              Click to capture mouse · WASD · Space jump · Q/E clips · 1–9 slot · P screenshot · Esc exit POV
              {lockWarning && <div className="mt-2 text-[10px] normal-case tracking-normal text-amber-200">{lockWarning}</div>}
            </div>
          </div>
        </Html>
      )}
    </>
  )
}

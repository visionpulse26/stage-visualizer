import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

const PITCH_LIMIT = 1.39 // ~80°

/**
 * First-person movement + look while orbit CameraControls are disconnected.
 * Pointer lock must be active on `gl.domElement` for mouse look (see PovFpsRig overlay).
 */
export function usePovController({
  enabled,
  camera,
  gl,
  floorY = 1.7,
  geofenceBox,
  moveSpeed = 5,
  lookSensitivity = 0.002,
  onExit,
}) {
  const keysRef = useRef({})
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const velRef = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!enabled || !camera) return
    const e = new THREE.Euler(0, 0, 0, 'YXZ')
    e.setFromQuaternion(camera.quaternion, 'YXZ')
    yawRef.current = e.y
    pitchRef.current = e.x
    velRef.current.set(0, 0, 0)
  }, [enabled, camera])

  useEffect(() => {
    if (!enabled || !gl) return
    let wasLocked = document.pointerLockElement === gl.domElement
    const onPL = () => {
      const now = document.pointerLockElement === gl.domElement
      if (wasLocked && !now) onExit?.()
      wasLocked = now
    }
    document.addEventListener('pointerlockchange', onPL)
    return () => document.removeEventListener('pointerlockchange', onPL)
  }, [enabled, gl, onExit])

  useEffect(() => {
    if (!enabled) return
    const down = (ev) => {
      keysRef.current[ev.code] = true
    }
    const up = (ev) => {
      keysRef.current[ev.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !gl) return
    const onMove = (ev) => {
      if (document.pointerLockElement !== gl.domElement) return
      yawRef.current -= ev.movementX * lookSensitivity
      pitchRef.current -= ev.movementY * lookSensitivity
      pitchRef.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitchRef.current))
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [enabled, gl, lookSensitivity])

  const tick = useCallback(
    (delta) => {
      if (!enabled || !camera) return

      const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ')
      camera.quaternion.setFromEuler(euler)

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      forward.y = 0
      if (forward.lengthSq() > 1e-10) forward.normalize()
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
      right.y = 0
      if (right.lengthSq() > 1e-10) right.normalize()

      const keys = keysRef.current
      const dir = new THREE.Vector3()
      if (keys.KeyW || keys.ArrowUp) dir.add(forward)
      if (keys.KeyS || keys.ArrowDown) dir.addScaledVector(forward, -1)
      if (keys.KeyA || keys.ArrowLeft) dir.addScaledVector(right, -1)
      if (keys.KeyD || keys.ArrowRight) dir.addScaledVector(right, 1)

      if (dir.lengthSq() > 0) dir.normalize()

      velRef.current.addScaledVector(dir, moveSpeed * delta)
      velRef.current.multiplyScalar(0.85)

      camera.position.addScaledVector(velRef.current, delta)

      camera.position.y = floorY

      if (geofenceBox?.isBox3) {
        camera.position.x = Math.max(geofenceBox.min.x, Math.min(geofenceBox.max.x, camera.position.x))
        camera.position.z = Math.max(geofenceBox.min.z, Math.min(geofenceBox.max.z, camera.position.z))
      }
    },
    [enabled, camera, floorY, geofenceBox, moveSpeed],
  )

  return { tick }
}

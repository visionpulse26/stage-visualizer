import { useEffect, useRef, useCallback, useMemo } from 'react'
import * as THREE from 'three'

const PITCH_LIMIT = 1.39 // ~80°

/**
 * First-person movement + look while orbit CameraControls are disconnected.
 * Pointer lock must be active on `gl.domElement` for mouse look (see PovFpsRig overlay).
 * Losing pointer lock does not exit POV — pages handle Esc / Exit button to restore orbit.
 *
 * When `rigidBodyRef` is set (Rapier kinematic body), translation is driven before the
 * physics step and XZ clamp is skipped — geofence walls handle boundaries (Phase 3).
 */
export function usePovController({
  enabled,
  camera,
  gl,
  floorY = 1.7,
  geofenceBox,
  geofencePadding = 0,
  moveSpeed = 9,
  lookSensitivity = 0.002,
  rigidBodyRef,
}) {
  const keysRef = useRef({})
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const velRef = useRef(new THREE.Vector3())
  const tempForwardRef = useRef(new THREE.Vector3())
  const tempRightRef = useRef(new THREE.Vector3())
  const tempDirRef = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!enabled || !camera) return
    const e = new THREE.Euler(0, 0, 0, 'YXZ')
    e.setFromQuaternion(camera.quaternion, 'YXZ')
    yawRef.current = e.y
    pitchRef.current = e.x
    velRef.current.set(0, 0, 0)
  }, [enabled, camera])

  const expandedGeofence = useMemo(() => {
    if (!geofenceBox?.isBox3) return null
    if (geofencePadding <= 0) return geofenceBox
    const b = geofenceBox.clone()
    b.min.x -= geofencePadding
    b.max.x += geofencePadding
    b.min.z -= geofencePadding
    b.max.z += geofencePadding
    return b
  }, [geofenceBox, geofencePadding])

  useEffect(() => {
    if (!enabled) return
    const down = (ev) => {
      if (gl && document.pointerLockElement !== gl.domElement) return
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
      const isLocked = !gl || document.pointerLockElement === gl.domElement

      const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ')
      camera.quaternion.setFromEuler(euler)

      if (!isLocked) {
        keysRef.current = {}
        velRef.current.set(0, 0, 0)
        return
      }

      const forward = tempForwardRef.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
      forward.y = 0
      if (forward.lengthSq() > 1e-10) forward.normalize()
      const right = tempRightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
      right.y = 0
      if (right.lengthSq() > 1e-10) right.normalize()

      const keys = keysRef.current
      const dir = tempDirRef.current.set(0, 0, 0)
      if (keys.KeyW || keys.ArrowUp) dir.add(forward)
      if (keys.KeyS || keys.ArrowDown) dir.addScaledVector(forward, -1)
      if (keys.KeyA || keys.ArrowLeft) dir.addScaledVector(right, -1)
      if (keys.KeyD || keys.ArrowRight) dir.addScaledVector(right, 1)

      if (dir.lengthSq() > 0) dir.normalize()

      velRef.current.copy(dir).multiplyScalar(moveSpeed)

      const rb = rigidBodyRef?.current
      if (rb) {
        const t = rb.translation()
        const nx = t.x + velRef.current.x * delta
        const ny = floorY
        const nz = t.z + velRef.current.z * delta
        rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz })
      } else {
        camera.position.addScaledVector(velRef.current, delta)
        camera.position.y = floorY
        if (expandedGeofence?.isBox3) {
          camera.position.x = Math.max(expandedGeofence.min.x, Math.min(expandedGeofence.max.x, camera.position.x))
          camera.position.z = Math.max(expandedGeofence.min.z, Math.min(expandedGeofence.max.z, camera.position.z))
        }
      }
    },
    [enabled, camera, floorY, expandedGeofence, gl, moveSpeed, rigidBodyRef],
  )

  return { tick }
}

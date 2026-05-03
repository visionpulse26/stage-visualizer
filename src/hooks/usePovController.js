import { useEffect, useRef, useCallback, useMemo } from 'react'
import * as THREE from 'three'

const PITCH_LIMIT = 1.39
const GLOBAL_FLOOR_TOP_Y = 0
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * First-person movement + look while orbit CameraControls are disconnected.
 * Pointer lock must be active on `gl.domElement` for mouse look.
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
  stageColliders = [],
  capsuleRestCenterY = 0.83,
  capsuleRadius = 0.28,
  jumpSpeed = 7.2,
}) {
  const keysRef = useRef({})
  const prevJumpRef = useRef(false)
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
    prevJumpRef.current = false
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
      if (ev.code === 'Space') ev.preventDefault()
      keysRef.current[ev.code] = true
    }

    const up = (ev) => {
      if (ev.code === 'Space') ev.preventDefault()
      keysRef.current[ev.code] = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [enabled, gl])

  const isGrounded = useCallback((rb) => {
    if (!rb) return false
    const p = rb.translation()
    const v = rb.linvel()
    if (v.y > 0.25) return false

    const footY = p.y - capsuleRestCenterY

    // Default Rapier floor slab from PovStageColliders. This keeps jump working
    // even before admin assigns any mesh as a floor collider.
    if (Math.abs(footY - GLOBAL_FLOOR_TOP_Y) <= 0.25) return true

    const floorColliders = stageColliders.filter((s) => s.type === 'floor' || s.type === 'explicit-floor')
    for (const floor of floorColliders) {
      const [cx, cy, cz] = floor.position
      const [hx, hy, hz] = floor.halfExtents
      const top = cy + hy
      const insideX = p.x >= cx - hx - capsuleRadius && p.x <= cx + hx + capsuleRadius
      const insideZ = p.z >= cz - hz - capsuleRadius && p.z <= cz + hz + capsuleRadius
      const nearTop = footY >= top - 0.12 && footY <= top + 0.3
      if (insideX && insideZ && nearTop) return true
    }

    return false
  }, [capsuleRadius, capsuleRestCenterY, stageColliders])

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

  // applyLook: called every render frame (useFrame) — rotation is always smooth
  const applyLook = useCallback(() => {
    if (!enabled || !camera) return
    _euler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(_euler)
  }, [enabled, camera])

  // tick: called in useBeforePhysicsStep at fixed 60hz — drives velocity only
  const tick = useCallback(
    (_delta) => {
      if (!enabled || !camera) return
      const isLocked = !gl || document.pointerLockElement === gl.domElement

      if (!isLocked) {
        keysRef.current = {}
        velRef.current.set(0, 0, 0)
        prevJumpRef.current = false
        return
      }

      // Use current camera quaternion (already set by applyLook this frame)
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
        const current = rb.linvel()
        const wantsJump = !!keys.Space
        const canJump = wantsJump && !prevJumpRef.current && isGrounded(rb)
        prevJumpRef.current = wantsJump
        rb.setLinvel({
          x: velRef.current.x,
          y: canJump ? jumpSpeed : current.y,
          z: velRef.current.z,
        }, true)
      } else {
        prevJumpRef.current = false
        camera.position.addScaledVector(velRef.current, _delta)
        camera.position.y = floorY
        if (expandedGeofence?.isBox3) {
          camera.position.x = Math.max(expandedGeofence.min.x, Math.min(expandedGeofence.max.x, camera.position.x))
          camera.position.z = Math.max(expandedGeofence.min.z, Math.min(expandedGeofence.max.z, camera.position.z))
        }
      }
    },
    [enabled, camera, floorY, expandedGeofence, gl, isGrounded, jumpSpeed, moveSpeed, rigidBodyRef],
  )

  return { tick, applyLook }
}

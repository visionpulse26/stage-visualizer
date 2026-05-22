import { useCallback, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useAfterPhysicsStep } from '@react-three/rapier'
import { usePovController } from '../../hooks/usePovController'

const FIXED_DT = 1 / 60
const CAPSULE_HALF_HEIGHT = 0.55
const CAPSULE_RADIUS = 0.28
const CAPSULE_REST_CENTER_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS
const FALL_RESET_Y = -8

function getValidRigidBody(ref) {
  const body = ref?.current
  if (!body) return null
  try {
    if (body.isValid && !body.isValid()) return null
    if (body.isInvalid?.()) return null
  } catch {
    return null
  }
  return body
}
const clamp = (value, min, max) => {
  if (min > max) return (min + max) * 0.5
  return Math.max(min, Math.min(max, value))
}

function findSpawnFromFloorColliders(camera, stageColliders) {
  const floors = stageColliders.filter((s) => s.type === 'floor' || s.type === 'explicit-floor')
  if (floors.length === 0) return null

  let best = null
  let bestScore = Infinity

  for (const floor of floors) {
    const [cx, cy, cz] = floor.position
    const [hx, hy, hz] = floor.halfExtents
    const insideX = camera.position.x >= cx - hx && camera.position.x <= cx + hx
    const insideZ = camera.position.z >= cz - hz && camera.position.z <= cz + hz
    const dx = insideX ? 0 : Math.min(Math.abs(camera.position.x - (cx - hx)), Math.abs(camera.position.x - (cx + hx)))
    const dz = insideZ ? 0 : Math.min(Math.abs(camera.position.z - (cz - hz)), Math.abs(camera.position.z - (cz + hz)))
    const score = dx * dx + dz * dz

    if (score < bestScore) {
      const x = clamp(camera.position.x, cx - hx + CAPSULE_RADIUS, cx + hx - CAPSULE_RADIUS)
      const z = clamp(camera.position.z, cz - hz + CAPSULE_RADIUS, cz + hz - CAPSULE_RADIUS)
      best = [x, cy + hy + CAPSULE_REST_CENTER_Y + 0.08, z]
      bestScore = score
    }
  }

  return best
}

export function PovKinematicDriver({ enabled, floorY, geofenceBox, geofencePadding, gl, stageColliders = [], moveSpeed = 9 }) {
  const { camera } = useThree()
  const rb = useRef(null)
  const eyeOffset = floorY - CAPSULE_REST_CENTER_Y
  const spawn = useMemo(
    () => findSpawnFromFloorColliders(camera, stageColliders) ?? [
      camera.position.x,
      Math.max(CAPSULE_REST_CENTER_Y + 2, camera.position.y - eyeOffset),
      camera.position.z,
    ],
    // Capture the mount position. Height slider changes the eye offset, not the body spawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { tick, applyLook } = usePovController({
    enabled,
    camera,
    gl,
    floorY,
    geofenceBox,
    geofencePadding,
    rigidBodyRef: rb,
    stageColliders,
    capsuleRestCenterY: CAPSULE_REST_CENTER_Y,
    capsuleRadius: CAPSULE_RADIUS,
    moveSpeed,
  })

  const syncCameraToBody = useCallback(() => {
    const body = getValidRigidBody(rb)
    if (!body) return
    const p = body.translation()
    camera.position.set(p.x, p.y + eyeOffset, p.z)
  }, [camera, eyeOffset])

  // Look + camera follow run on the render clock so POV stays smooth on
  // high-refresh displays instead of waiting for the fixed 60hz physics step.
  useFrame(() => {
    if (!enabled) return
    applyLook()
    syncCameraToBody()
  })

  useBeforePhysicsStep(() => {
    if (!enabled) return
    tick(FIXED_DT)
  })

  useAfterPhysicsStep(() => {
    if (!enabled) return
    const body = getValidRigidBody(rb)
    if (!body) return
    syncCameraToBody()
    const p = body.translation()

    if (p.y < FALL_RESET_Y) {
      body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
  })

  return (
    <RigidBody
      ref={rb}
      type="dynamic"
      colliders={false}
      position={spawn}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      angularDamping={1}
      canSleep={false}
      ccd
    >
      <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} />
    </RigidBody>
  )
}

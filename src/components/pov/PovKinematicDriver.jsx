import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useAfterPhysicsStep } from '@react-three/rapier'
import { usePovController } from '../../hooks/usePovController'

const FIXED_DT = 1 / 60
const CAPSULE_HALF_HEIGHT = 0.55
const CAPSULE_RADIUS = 0.28
const CAPSULE_REST_CENTER_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS

export function PovKinematicDriver({ enabled, floorY, geofenceBox, geofencePadding, gl }) {
  const { camera } = useThree()
  const rb = useRef(null)
  const eyeOffset = floorY - CAPSULE_REST_CENTER_Y
  const spawn = useMemo(
    () => [
      camera.position.x,
      Math.max(CAPSULE_REST_CENTER_Y + 2, camera.position.y - eyeOffset),
      camera.position.z,
    ],
    // Capture the mount position. Height slider changes the eye offset, not the body spawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const { tick } = usePovController({
    enabled,
    camera,
    gl,
    floorY,
    geofenceBox,
    geofencePadding,
    rigidBodyRef: rb,
  })

  useBeforePhysicsStep(() => {
    if (!enabled) return
    tick(FIXED_DT)
  })

  useAfterPhysicsStep(() => {
    if (!enabled || !rb.current) return
    const p = rb.current.translation()
    camera.position.set(p.x, p.y + eyeOffset, p.z)

    if (p.y < -40) {
      rb.current.setTranslation({ x: spawn[0], y: CAPSULE_REST_CENTER_Y + 4, z: spawn[2] }, true)
      rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
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

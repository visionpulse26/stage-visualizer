import { useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useAfterPhysicsStep } from '@react-three/rapier'
import { usePovController } from '../../hooks/usePovController'

const FIXED_DT = 1 / 60

/**
 * Kinematic capsule + Rapier step hooks — drives `usePovController` before each physics step
 * and copies the solved translation back onto the default camera after the step.
 */
export function PovKinematicDriver({ enabled, floorY, geofenceBox, geofencePadding, gl }) {
  const { camera } = useThree()
  const rb = useRef(null)
  const [spawn] = useState(() => [camera.position.x, camera.position.y, camera.position.z])

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
    camera.position.set(p.x, p.y, p.z)
  })

  return (
    <RigidBody
      ref={rb}
      type="kinematicPosition"
      colliders={false}
      position={spawn}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[0.42, 0.28]} />
    </RigidBody>
  )
}

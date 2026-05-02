import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useMemo } from 'react'
import { buildGeofenceWallSpecs } from './povGeofenceColliders'

/** Fixed floor + vertical boundary walls for POV (Epic 1 Phase 3). */
export function PovStageColliders({ geofenceBox, geofencePadding, stageColliders = [] }) {
  const walls = useMemo(
    () => buildGeofenceWallSpecs(geofenceBox, geofencePadding),
    [geofenceBox, geofencePadding],
  )

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[160, 0.35, 160]} position={[0, -0.35, 0]} />
      </RigidBody>
      {walls.map((w, i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={w.pos}>
          <CuboidCollider args={w.args} />
        </RigidBody>
      ))}
      {stageColliders.map((collider) => (
        <RigidBody
          key={collider.id}
          type="fixed"
          colliders={false}
          position={collider.position}
        >
          <CuboidCollider args={collider.halfExtents} />
        </RigidBody>
      ))}
    </group>
  )
}

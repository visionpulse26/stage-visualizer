import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useMemo } from 'react'
import { buildGeofenceFloorSpec, buildGeofenceWallSpecs } from './povGeofenceColliders'

/**
 * Fixed physics colliders for POV:
 *   - One large floor slab
 *   - Four vertical geofence walls aligned to model AABB + padding
 *   - Per-mesh stage colliders (floor | blocker | explicit-floor | explicit-blocker)
 *     produced by buildPovColliders() and passed as `stageColliders`
 *
 * Only floor-type specs receive a Y-offset to sit flush with the slab.
 * All colliders are `type="fixed"` — zero runtime CPU cost when idle.
 */
export function PovStageColliders({ geofenceBox, geofencePadding, stageColliders = [] }) {
  const walls = useMemo(
    () => buildGeofenceWallSpecs(geofenceBox, geofencePadding),
    [geofenceBox, geofencePadding],
  )
  const fallbackFloor = useMemo(() => {
    const base = buildGeofenceFloorSpec(geofenceBox, geofencePadding)
    const floorTiles = stageColliders.filter(
      (s) => s.type === 'floor' || s.type === 'explicit-floor',
    )
    if (floorTiles.length === 0) return base

    // Find the lowest floor tile top surface across all configured tiles
    const lowestTileTop = floorTiles.reduce(
      (minY, s) => Math.min(minY, s.position[1] + s.halfExtents[1]),
      Infinity,
    )
    const ht = base.args[1] // slab half-thickness
    // Only raise if the lowest tile top is meaningfully above the default y=0 fallback
    if (!Number.isFinite(lowestTileTop) || lowestTileTop < 0.3) return base

    // Position fallback slab so its top surface is just below the lowest floor tile.
    // Gaps between tiles cause only a ~5cm drop instead of falling all the way to y=0.
    return {
      pos: [base.pos[0], lowestTileTop - ht - 0.05, base.pos[2]],
      args: base.args,
    }
  }, [geofenceBox, geofencePadding, stageColliders])

  const floors = stageColliders.filter(
    (s) => s.type === 'floor' || s.type === 'explicit-floor',
  )
  const blockers = stageColliders.filter(
    (s) => s.type === 'blocker' || s.type === 'explicit-blocker',
  )

  return (
    <group name="pov-stage-colliders">
      {/* ── Global floor slab ── */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={fallbackFloor.args} position={fallbackFloor.pos} />
      </RigidBody>

      {/* ── Geofence walls ── */}
      {walls.map((w, i) => (
        <RigidBody key={`wall_${i}`} type="fixed" colliders={false} position={w.pos}>
          <CuboidCollider args={w.args} />
        </RigidBody>
      ))}

      {/* ── Per-mesh floor colliders (thin, horizontal slabs) ── */}
      {floors.map((s) => (
        <RigidBody key={s.id} type="fixed" colliders={false} position={s.position}>
          <CuboidCollider args={s.halfExtents} />
        </RigidBody>
      ))}

      {/* ── Per-mesh blocker colliders (vertical / mixed obstacles) ── */}
      {blockers.map((s) => (
        <RigidBody key={s.id} type="fixed" colliders={false} position={s.position}>
          <CuboidCollider args={s.halfExtents} />
        </RigidBody>
      ))}
    </group>
  )
}

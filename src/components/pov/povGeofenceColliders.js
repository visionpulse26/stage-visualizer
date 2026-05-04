import * as THREE from 'three'

/**
 * Expanded XZ bounds (same logic as usePovController expandedGeofence).
 */
export function getExpandedXZBounds(geofenceBox, geofencePadding) {
  if (!geofenceBox?.isBox3) return null
  const b = geofenceBox.clone()
  if (geofencePadding > 0) {
    b.min.x -= geofencePadding
    b.max.x += geofencePadding
    b.min.z -= geofencePadding
    b.max.z += geofencePadding
  }
  return b
}

/**
 * Four thin vertical walls + specs for Rapier CuboidColliders (half extents + positions).
 * @param {number} wallHalfThickness — half-thickness along X or Z axis
 * @param {number} wallHalfHeight — half height along Y (tall box)
 */
export function buildGeofenceWallSpecs(geofenceBox, geofencePadding, wallHalfThickness = 0.12, wallHalfHeight = 14) {
  const b = getExpandedXZBounds(geofenceBox, geofencePadding)
  if (!b) return []
  const mx = b.min.x
  const Mx = b.max.x
  const mz = b.min.z
  const Mz = b.max.z
  const cx = (mx + Mx) * 0.5
  const cz = (mz + Mz) * 0.5
  const dx = (Mx - mx) * 0.5 + wallHalfThickness
  const dz = (Mz - mz) * 0.5 + wallHalfThickness
  const t = wallHalfThickness

  return [
    { pos: [mx - t, wallHalfHeight, cz], args: [t, wallHalfHeight, dz] },
    { pos: [Mx + t, wallHalfHeight, cz], args: [t, wallHalfHeight, dz] },
    { pos: [cx, wallHalfHeight, mz - t], args: [dx, wallHalfHeight, t] },
    { pos: [cx, wallHalfHeight, Mz + t], args: [dx, wallHalfHeight, t] },
  ]
}

/**
 * Wide fixed slab placed just below the global floor (y=0). Acts as a fallback
 * surface so jumping near the geofence boundary never lets the capsule slip
 * through the seams between per-mesh floor tiles.
 */
export function buildGeofenceFloorSpec(geofenceBox, geofencePadding, floorHalfThickness = 0.35) {
  const b = getExpandedXZBounds(geofenceBox, geofencePadding)
  if (!b) {
    return { pos: [0, -floorHalfThickness, 0], args: [300, floorHalfThickness, 300] }
  }

  const cx = (b.min.x + b.max.x) * 0.5
  const cz = (b.min.z + b.max.z) * 0.5
  const hx = Math.max((b.max.x - b.min.x) * 0.5 + 4, 20)
  const hz = Math.max((b.max.z - b.min.z) * 0.5 + 4, 20)

  return {
    pos: [cx, -floorHalfThickness, cz],
    args: [hx, floorHalfThickness, hz],
  }
}

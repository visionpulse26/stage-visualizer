/**
 * buildPovCollidersFromConfig
 *
 * Given the mesh metadata array (from scanStageMeshes) and the admin's
 * povColliderConfig (overrides stored in scene_config), produce a flat list of
 * PovColliderSpec objects that PovStageColliders will materialise as Rapier
 * CuboidColliders at runtime.
 *
 * Config shape:
 *   { overrides: { [meshId]: 'floor' | 'blocker' | 'ignore' | 'auto' } }
 *
 * Effective role resolution (per mesh):
 *   override === 'auto' or missing  →  use suggestedRole from scanner
 *   override === 'floor'            →  floor
 *   override === 'blocker'          →  blocker
 *   override === 'ignore'           →  skip (no collider)
 */

const MIN_HALF = 0.02 // guard against zero-size colliders
const MAX_STAGE_COLLIDERS = 600

function isFiniteVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
}

function pushSpec(specs, spec) {
  if (specs.length >= MAX_STAGE_COLLIDERS) return false
  if (!isFiniteVec3(spec.position) || !isFiniteVec3(spec.halfExtents)) return true
  const halfExtents = spec.halfExtents.map((n) => Math.max(Math.abs(n), MIN_HALF))
  if (halfExtents.some((n) => n > 10000)) return true
  specs.push({
    ...spec,
    halfExtents,
  })
  return true
}

export function buildPovCollidersFromConfig(meshMetadata = [], povColliderConfig = {}) {
  const overrides = povColliderConfig?.overrides ?? {}
  const specs = []

  for (const meta of meshMetadata) {
    const override = overrides[meta.id]
    const effectiveRole =
      override === undefined || override === 'auto'
        ? meta.suggestedRole
        : override

    if (effectiveRole !== 'floor' && effectiveRole !== 'blocker') continue

    if (effectiveRole === 'floor' && Array.isArray(meta.floorTiles) && meta.floorTiles.length > 0) {
      meta.floorTiles.forEach((tile, index) => {
        pushSpec(specs, {
          id: `${meta.id}_tile_${index}`,
          type: 'floor',
          position: tile.position,
          halfExtents: tile.halfExtents,
        })
      })
      continue
    }

    pushSpec(specs, {
      id:          meta.id,
      type:        effectiveRole,
      position:    meta.center,               // [x, y, z]
      halfExtents: [
        Math.max(meta.size.x * 0.5, MIN_HALF),
        Math.max(
          effectiveRole === 'floor' ? Math.min(meta.size.y * 0.5, 0.08) : meta.size.y * 0.5,
          MIN_HALF,
        ),
        Math.max(meta.size.z * 0.5, MIN_HALF),
      ],
    })
  }

  if (import.meta.env.DEV) {
    const floors   = specs.filter(s => s.type === 'floor').length
    const blockers = specs.filter(s => s.type === 'blocker').length
    console.log(`[buildPovCollidersFromConfig] ${specs.length} colliders → ${floors} floor / ${blockers} blocker`)
  }

  return specs
}

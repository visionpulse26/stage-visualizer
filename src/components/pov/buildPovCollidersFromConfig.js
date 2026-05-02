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

    specs.push({
      id:          meta.id,
      type:        effectiveRole,
      position:    meta.center,               // [x, y, z]
      halfExtents: [
        Math.max(meta.size.x * 0.5, MIN_HALF),
        Math.max(meta.size.y * 0.5, MIN_HALF),
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

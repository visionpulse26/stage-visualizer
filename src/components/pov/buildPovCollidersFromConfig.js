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

import { MIN_HALF, buildBlockerSubdivisions } from './povColliderUtils'

const MAX_BLOCKER_SPECS_TOTAL = 1200

export function buildPovCollidersFromConfig(meshMetadata = [], povColliderConfig = {}) {
  const overrides = povColliderConfig?.overrides ?? {}
  const specs = []
  let blockerCount = 0

  for (const meta of meshMetadata) {
    const override = overrides[meta.id]
    const effectiveRole =
      override === undefined || override === 'auto'
        ? meta.suggestedRole
        : override

    if (effectiveRole !== 'floor' && effectiveRole !== 'blocker') continue

    if (effectiveRole === 'floor' && Array.isArray(meta.floorTiles) && meta.floorTiles.length > 0) {
      meta.floorTiles.forEach((tile, index) => {
        specs.push({
          id: `${meta.id}_tile_${index}`,
          type: 'floor',
          position: tile.position,
          halfExtents: tile.halfExtents,
        })
      })
      continue
    }

    if (effectiveRole === 'blocker') {
      const blockerParts = buildBlockerSubdivisions(meta)
      blockerParts.forEach((part) => {
        if (blockerCount >= MAX_BLOCKER_SPECS_TOTAL) return
        specs.push({
          id: part.id,
          type: 'blocker',
          position: part.position,
          halfExtents: part.halfExtents,
        })
        blockerCount += 1
      })
      continue
    }

    specs.push({
      id:       meta.id,
      type:     effectiveRole,
      position: meta.center,
      halfExtents: [
        Math.max(meta.size.x * 0.5, MIN_HALF),
        Math.max(Math.min(meta.size.y * 0.5, 0.08), MIN_HALF),
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

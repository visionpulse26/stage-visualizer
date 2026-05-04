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
const MAX_STAGE_COLLIDERS = 1800
const MAX_HALF_EXTENT = 10000

function isFiniteVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
}

function pushSpec(specs, spec) {
  if (specs.length >= MAX_STAGE_COLLIDERS) return false
  if (!isFiniteVec3(spec.position) || !isFiniteVec3(spec.halfExtents)) return true
  const halfExtents = spec.halfExtents.map((n) => Math.max(Math.abs(n), MIN_HALF))
  if (halfExtents.some((n) => n > MAX_HALF_EXTENT)) return true
  specs.push({ ...spec, halfExtents })
  return true
}

export function buildPovCollidersFromConfig(meshMetadata = [], povColliderConfig = {}) {
  const overrides = povColliderConfig?.overrides ?? {}
  const specs = []
  let blockerCount = 0

  for (const meta of meshMetadata) {
    if (!meta || !meta.size || !isFiniteVec3(meta.center)) continue

    const override = overrides[meta.id]
    const hasExplicitOverride = override === 'floor' || override === 'blocker'
    const effectiveRole =
      override === undefined || override === 'auto'
        ? meta.suggestedRole
        : override

    if (effectiveRole !== 'floor' && effectiveRole !== 'blocker') continue

    if (effectiveRole === 'floor' && Array.isArray(meta.floorTiles) && meta.floorTiles.length > 0) {
      for (let i = 0; i < meta.floorTiles.length; i++) {
        const tile = meta.floorTiles[i]
        const ok = pushSpec(specs, {
          id: `${meta.id}_tile_${i}`,
          type: hasExplicitOverride ? 'explicit-floor' : 'floor',
          position: tile.position,
          halfExtents: tile.halfExtents,
        })
        if (!ok) break
      }
      continue
    }

    if (effectiveRole === 'blocker') {
      const blockerParts = buildBlockerSubdivisions(meta)
      for (const part of blockerParts) {
        if (blockerCount >= MAX_BLOCKER_SPECS_TOTAL) break
        const ok = pushSpec(specs, {
          id: part.id,
          type: hasExplicitOverride ? 'explicit-blocker' : 'blocker',
          position: part.position,
          halfExtents: part.halfExtents,
        })
        if (!ok) break
        blockerCount += 1
      }
      continue
    }

    pushSpec(specs, {
      id:       meta.id,
      type:     hasExplicitOverride ? `explicit-${effectiveRole}` : effectiveRole,
      position: meta.center,
      halfExtents: [
        Math.max(meta.size.x * 0.5, MIN_HALF),
        Math.max(Math.min(meta.size.y * 0.5, 0.08), MIN_HALF),
        Math.max(meta.size.z * 0.5, MIN_HALF),
      ],
    })
  }

  if (import.meta.env.DEV) {
    const floors   = specs.filter(s => s.type === 'floor' || s.type === 'explicit-floor').length
    const blockers = specs.filter(s => s.type === 'blocker' || s.type === 'explicit-blocker').length
    console.log(`[buildPovCollidersFromConfig] ${specs.length} colliders → ${floors} floor / ${blockers} blocker`)
  }

  return specs
}

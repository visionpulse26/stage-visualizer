const MIN_HALF = 0.02
const BLOCKER_SUBDIVIDE_THRESHOLD = 2.4
const BLOCKER_TARGET_CELL_SIZE = 1.4
const BLOCKER_MAX_SUBDIVISIONS = 96

function clampHalf(value) {
  return Math.max(value, MIN_HALF)
}

function isLikelyFloorOrStair(meta, sx, sy, sz) {
  const tokens = `${meta.name || ''} ${(meta.materialNames || []).join(' ')}`.toUpperCase()

  // Named floor / stair tokens
  if (/\b(FLOOR|DECK|RUNWAY|CATWALK|GROUND|STAIR|STEP|RAMP|STAGE)\b/.test(tokens)) return true

  // Geometrically flat (thin horizontal slab)
  if (sy <= 0.55 && Math.max(sx, sz) >= 1.5) return true

  // Stair body: moderate height (0.5–3m), non-trivial footprint, low center
  const [, cy] = meta.center
  const maxXZ = Math.max(sx, sz)
  const isStairBody = sy >= 0.5 && sy <= 3.5 && maxXZ >= 1.5 && (cy < sy + 0.5)
  if (isStairBody) return true

  // Very flat relative to smallest XZ dimension
  const flatness = sy / Math.max(Math.min(sx, sz), MIN_HALF)
  return flatness < 0.3 && maxXZ > 1.5
}

export function buildBlockerSubdivisions(meta) {
  const [cx, cy, cz] = meta.center
  const sx = Math.max(meta.size?.x ?? 0, MIN_HALF * 2)
  const sy = Math.max(meta.size?.y ?? 0, MIN_HALF * 2)
  const sz = Math.max(meta.size?.z ?? 0, MIN_HALF * 2)

  // Avoid blocker colliders on long floor decks / stair meshes.
  if (isLikelyFloorOrStair(meta, sx, sy, sz)) return []

  if (Math.max(sx, sz) <= BLOCKER_SUBDIVIDE_THRESHOLD) {
    return [
      {
        id: meta.id,
        position: [cx, cy, cz],
        halfExtents: [clampHalf(sx * 0.5), clampHalf(sy * 0.5), clampHalf(sz * 0.5)],
      },
    ]
  }

  const countX = Math.max(1, Math.ceil(sx / BLOCKER_TARGET_CELL_SIZE))
  const countZ = Math.max(1, Math.ceil(sz / BLOCKER_TARGET_CELL_SIZE))

  let finalCountX = countX
  let finalCountZ = countZ
  const total = countX * countZ
  if (total > BLOCKER_MAX_SUBDIVISIONS) {
    const scale = Math.sqrt(BLOCKER_MAX_SUBDIVISIONS / total)
    finalCountX = Math.max(1, Math.floor(countX * scale))
    finalCountZ = Math.max(1, Math.floor(countZ * scale))
  }

  const cellX = sx / finalCountX
  const cellZ = sz / finalCountZ
  const minX = cx - sx * 0.5
  const minZ = cz - sz * 0.5
  const out = []

  for (let ix = 0; ix < finalCountX; ix += 1) {
    const x = minX + cellX * (ix + 0.5)
    for (let iz = 0; iz < finalCountZ; iz += 1) {
      const z = minZ + cellZ * (iz + 0.5)
      out.push({
        id: `${meta.id}_b_${ix}_${iz}`,
        position: [x, cy, z],
        halfExtents: [clampHalf(cellX * 0.5), clampHalf(sy * 0.5), clampHalf(cellZ * 0.5)],
      })
      if (out.length >= BLOCKER_MAX_SUBDIVISIONS) return out
    }
  }

  return out
}

export function splitColliderSpecsByRole(stageColliders = []) {
  const floors = []
  const blockers = []
  for (const spec of stageColliders) {
    if (spec.type === 'floor' || spec.type === 'explicit-floor') {
      floors.push(spec)
      continue
    }
    if (spec.type === 'blocker' || spec.type === 'explicit-blocker') {
      blockers.push(spec)
    }
  }
  return { floors, blockers }
}

export { MIN_HALF }

import * as THREE from 'three'

const FLOOR_TILE_TARGET_SIZE = 0.75
const FLOOR_TILE_THICKNESS = 0.12
const MAX_FLOOR_TILES_PER_MESH = 700
const raycaster = new THREE.Raycaster()
const down = new THREE.Vector3(0, -1, 0)

// ── Auto-suggest heuristic ────────────────────────────────────────────────────
// This is only a HINT to prefill the Admin UI — not a source of truth.
// Users override via the PovColliderManager panel.
function suggestRole(name, materialNames, center, size) {
  const tokens = [name, ...materialNames]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  // Always ignore: LED / truss / rigging
  if (/LED_MASTER_MAT|LED_TRANSPARENT_MAT|LED_GRID_/.test(tokens)) return 'ignore'
  if (/\b(TRUSS|ALUMIN|ALU|RIGGING|CABLE|CHAIN|WIRE|ROPE)\b/.test(tokens)) return 'ignore'

  // Ignore tiny objects
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim < 0.3) return 'ignore'

  // Ignore tall thin poles (e.g., stand legs)
  const minXZ = Math.min(size.x, size.z)
  if (size.y > 8 && minXZ < 0.35) return 'ignore'

  // Ignore objects hanging very high (above 6m center)
  if (center.y > 6) return 'ignore'

  // Floor heuristic: named like floor, or: wide + thin vertically + low center
  if (/\b(FLOOR|RUNWAY|DECK|CATWALK|STAGE|STEP|STAIR|GROUND|MAT)\b/.test(tokens)) return 'floor'
  const isWide = size.x > 1.5 || size.z > 1.5
  const isThin = size.y < 0.5
  const isLow  = center.y < 1.5
  if (isWide && isThin && isLow) return 'floor'

  // Blocker heuristic: named like cover/mask/frame, or: big box-like object
  if (/\b(COVER|MASK|FORMAT|FRAME|SUPPORT|WALL|FASCIA|PANEL|PILLAR|COLUMN|BACKDROP|SCRIM|LEG)\b/.test(tokens)) return 'blocker'
  const isLargeEnough = Math.max(size.x, size.z) > 0.8 && size.y > 0.5
  if (isLargeEnough) return 'blocker'

  return 'ignore'
}

// ── Main scanner ──────────────────────────────────────────────────────────────
/**
 * Scans every renderable mesh in a cloned (normalized) scene and returns
 * metadata suitable for the Admin Collider Manager panel.
 *
 * @param {THREE.Object3D} clonedScene - already world-normalized scene root
 * @returns {Array<MeshMeta>}
 *
 * MeshMeta shape:
 *   id              - stable string key for override map (name + index)
 *   name            - mesh.name from GLB
 *   materialNames   - array of material names on this mesh
 *   center          - [x, y, z] world center
 *   size            - { x, y, z } world extents
 *   visible         - mesh.visible at time of scan
 *   suggestedRole   - 'floor' | 'blocker' | 'ignore'  (hint only)
 */
function shouldSkipFloorTiles(name, materialNames) {
  const tokens = [name, ...materialNames]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  return /LED_MASTER_MAT|LED_TRANSPARENT_MAT|LED_GRID_/.test(tokens) ||
    /\b(TRUSS|ALUMIN|ALU|RIGGING|CABLE|CHAIN|WIRE|ROPE)\b/.test(tokens)
}

function buildFloorTilesForMesh(mesh, box, size, materialNames) {
  if (shouldSkipFloorTiles(mesh.name, materialNames)) return []
  if (Math.max(size.x, size.z) < 0.6 || size.y > 2.4) return []

  const area = Math.max(size.x * size.z, FLOOR_TILE_TARGET_SIZE * FLOOR_TILE_TARGET_SIZE)
  const estimated = area / (FLOOR_TILE_TARGET_SIZE * FLOOR_TILE_TARGET_SIZE)
  const cellSize = estimated > MAX_FLOOR_TILES_PER_MESH
    ? Math.sqrt(area / MAX_FLOOR_TILES_PER_MESH)
    : FLOOR_TILE_TARGET_SIZE
  const half = cellSize * 0.5
  const yStart = box.max.y + Math.max(2, size.y + 1)
  const yEnd = box.min.y - 0.25
  const origin = new THREE.Vector3()
  const tiles = []

  for (let x = box.min.x + half; x <= box.max.x - half * 0.25; x += cellSize) {
    for (let z = box.min.z + half; z <= box.max.z - half * 0.25; z += cellSize) {
      origin.set(x, yStart, z)
      raycaster.set(origin, down)
      raycaster.far = yStart - yEnd
      const hit = raycaster.intersectObject(mesh, false)[0]
      if (!hit) continue

      const normalY = hit.face?.normal
        ? hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize().y
        : 1
      if (normalY < 0.35) continue

      tiles.push({
        position: [x, hit.point.y - FLOOR_TILE_THICKNESS * 0.5, z],
        halfExtents: [half, FLOOR_TILE_THICKNESS * 0.5, half],
      })
    }
  }

  return tiles
}

export function scanStageMeshes(clonedScene) {
  clonedScene.updateMatrixWorld(true)

  const _box    = new THREE.Box3()
  const _size   = new THREE.Vector3()
  const _center = new THREE.Vector3()

  // Track name usage to build stable IDs (name_N for duplicates)
  const nameCount = {}
  const metas = []

  clonedScene.traverse((child) => {
    if (!child.isMesh) return
    if (!child.visible) return

    _box.setFromObject(child)
    if (_box.isEmpty()) return
    _box.getSize(_size)
    _box.getCenter(_center)

    const matNames = (Array.isArray(child.material) ? child.material : [child.material])
      .map((m) => m?.name ?? '')
      .filter(Boolean)

    const baseName = child.name || 'mesh'
    nameCount[baseName] = (nameCount[baseName] ?? 0) + 1
    const stableId =
      nameCount[baseName] === 1
        ? baseName
        : `${baseName}_${nameCount[baseName]}`

    const suggested = suggestRole(
      child.name,
      matNames,
      { x: _center.x, y: _center.y, z: _center.z },
      { x: _size.x,   y: _size.y,   z: _size.z },
    )

    metas.push({
      id:            stableId,
      name:          child.name,
      materialNames: matNames,
      center:        [_center.x, _center.y, _center.z],
      size:          { x: _size.x, y: _size.y, z: _size.z },
      visible:       child.visible,
      suggestedRole: suggested,
      floorTiles:    buildFloorTilesForMesh(child, _box.clone(), _size.clone(), matNames),
    })
  })

  if (import.meta.env.DEV) {
    const floors   = metas.filter(m => m.suggestedRole === 'floor').length
    const blockers = metas.filter(m => m.suggestedRole === 'blocker').length
    const ignored  = metas.filter(m => m.suggestedRole === 'ignore').length
    console.log(`[scanStageMeshes] ${metas.length} meshes → ${floors} floor / ${blockers} blocker / ${ignored} ignore`)
  }

  return metas
}

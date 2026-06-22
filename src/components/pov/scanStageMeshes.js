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

  // Stair / ramp bodies: moderate height + non-trivial footprint + low center → floor tiles handle them
  const maxXZ = Math.max(size.x, size.z)
  const isStairBody = size.y >= 0.5 && size.y <= 3.5 && maxXZ >= 1.5 && center.y < size.y + 0.5
  if (isStairBody) return 'floor'

  // Blocker heuristic: named like wall/column, or: clearly tall narrow object
  if (/\b(COVER|MASK|FORMAT|FRAME|SUPPORT|WALL|FASCIA|PANEL|PILLAR|COLUMN|BACKDROP|SCRIM|LEG)\b/.test(tokens)) return 'blocker'
  const isTallNarrow = size.y > 1.2 && Math.min(size.x, size.z) < 1.0 && maxXZ > 0.6
  if (isTallNarrow) return 'blocker'

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

function processMesh(child, nameCount) {
  const _box = new THREE.Box3().setFromObject(child)
  if (_box.isEmpty()) return null
  const _size = new THREE.Vector3()
  const _center = new THREE.Vector3()
  _box.getSize(_size)
  _box.getCenter(_center)

  // Scene.jsx swaps LED/stage materials in place (e.g. LED_MAPLED_MAIN →
  // LED_MASTER_MAT) but stashes the authored originals on userData first. Read
  // those so the scan reports the real authored names (needed to detect distinct
  // LED maps for multi-mapled); fall back to the live material when absent.
  const sourceMats = child.userData?.stageSourceMaterials
  const matArray = Array.isArray(sourceMats) && sourceMats.length
    ? sourceMats
    : (Array.isArray(child.material) ? child.material : [child.material])
  const matNames = matArray
    .map((m) => m?.name ?? '')
    .filter(Boolean)

  const baseName = child.name || 'mesh'
  nameCount[baseName] = (nameCount[baseName] ?? 0) + 1
  const stableId =
    nameCount[baseName] === 1 ? baseName : `${baseName}_${nameCount[baseName]}`

  const suggested = suggestRole(
    child.name,
    matNames,
    { x: _center.x, y: _center.y, z: _center.z },
    { x: _size.x, y: _size.y, z: _size.z },
  )

  return {
    id: stableId,
    name: child.name,
    materialNames: matNames,
    center: [_center.x, _center.y, _center.z],
    size: { x: _size.x, y: _size.y, z: _size.z },
    visible: child.visible,
    suggestedRole: suggested,
    floorTiles: buildFloorTilesForMesh(child, _box, _size, matNames),
  }
}

function collectMeshes(clonedScene) {
  const list = []
  clonedScene.traverse((c) => {
    if (c.isMesh && c.visible) list.push(c)
  })
  return list
}

function logSummary(metas) {
  if (!import.meta.env.DEV) return
  const floors   = metas.filter(m => m.suggestedRole === 'floor').length
  const blockers = metas.filter(m => m.suggestedRole === 'blocker').length
  const ignored  = metas.filter(m => m.suggestedRole === 'ignore').length
  console.log(`[scanStageMeshes] ${metas.length} meshes → ${floors} floor / ${blockers} blocker / ${ignored} ignore`)
}

export function scanStageMeshes(clonedScene) {
  clonedScene.updateMatrixWorld(true)
  const nameCount = {}
  const metas = []
  for (const child of collectMeshes(clonedScene)) {
    const meta = processMesh(child, nameCount)
    if (meta) metas.push(meta)
  }
  logSummary(metas)
  return metas
}

function nextIdle() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 60 })
    } else {
      setTimeout(resolve, 0)
    }
  })
}

/**
 * Async, idle-chunked variant of `scanStageMeshes`. Yields to the main thread
 * between batches so a heavy GLB doesn't freeze the frame.
 * Falls back to sync behavior if AbortSignal aborts mid-scan (returns partial).
 */
export async function scanStageMeshesAsync(clonedScene, { chunkSize = 8, signal } = {}) {
  clonedScene.updateMatrixWorld(true)
  const nameCount = {}
  const metas = []
  const meshes = collectMeshes(clonedScene)
  for (let i = 0; i < meshes.length; i += chunkSize) {
    if (signal?.aborted) break
    if (i > 0) await nextIdle()
    const end = Math.min(i + chunkSize, meshes.length)
    for (let k = i; k < end; k++) {
      const meta = processMesh(meshes[k], nameCount)
      if (meta) metas.push(meta)
    }
  }
  logSummary(metas)
  return metas
}

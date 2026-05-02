import * as THREE from 'three'

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

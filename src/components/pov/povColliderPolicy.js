/**
 * POV Collider Policy — Epic 1 Phase 3b
 *
 * Determines the collision role of a mesh based on:
 *   1. Explicit naming prefix in the mesh name (COLLIDER_FLOOR_*, COLLIDER_BLOCK_*)
 *   2. Material name patterns (see MATERIAL_RULES)
 *   3. Mesh name patterns (see MESH_RULES)
 *
 * Role types:
 *   'floor'    — walkable horizontal surface (floor, runway, step)
 *   'blocker'  — solid vertical/mixed obstacle (cover, frame, mask, support)
 *   'none'     — skip (LED, truss, rigging, too thin/tiny)
 *   'explicit' — explicit collider mesh in GLB (always wins)
 *
 * Priority: explicit > material/mesh rules (floor/blocker/none)
 * When a role is 'none', no collider is created.
 */

// ── Explicit collider mesh prefix (checked on mesh name only) ────────────────
const EXPLICIT_FLOOR_RE = /\bCOLLIDER_FLOOR\b/i
const EXPLICIT_BLOCK_RE = /\bCOLLIDER_BLOCK\b/i

// ── Token helpers ─────────────────────────────────────────────────────────────
function tokenize(...names) {
  return names
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
}

function has(tokens, ...patterns) {
  return patterns.some((p) => tokens.includes(p))
}

// ── None patterns — checked FIRST so noise is dropped early ──────────────────
// These are ordered intentionally: LED > TRUSS > decorative
const NONE_PATTERNS = [
  'LED_MASTER_MAT',
  'LED_TRANSPARENT_MAT',
  'LED_GRID_',
  // Truss / rigging
  'TRUSS',
  'ALUMINUM',
  'ALUMINIUM',
  'ALU_',
  'RIGGING',
  'PIPE_',
  'TUBE_',
  'CABLE',
  'CHAIN',
  'WIRE',
  // Decorative / cosmetic
  'DECAL',
  'LOGO_',
  'TEXT_',
  'LABEL_',
]

// ── Floor patterns ────────────────────────────────────────────────────────────
const FLOOR_PATTERNS = [
  'STAGE_FLOOR',
  'FLOOR_BLACK',
  'BLACK_FLOOR',
  'MAT_FLOOR',
  'FLOOR_MAT',
  'RUNWAY',
  'CATWALK',
  'DECK',
  'STEP',
  'STAIR',
  'PLATFORM',
  'WALKWAY',
  'RISER',
]

// ── Blocker patterns ──────────────────────────────────────────────────────────
const BLOCKER_PATTERNS = [
  'FORMAT',
  'FASCIA',
  'MASK',
  'CLADDING',
  'COVER',
  'CASING',
  'SHROUD',
  'SKIRT',
  'PANEL_BLACK',
  'TRIM_BLACK',
  'FRAME',
  'BRACKET',
  'STRUCT',
  'SUPPORT',
  'BEAM',
  'RAIL',
  'WALL',
  'PILLAR',
  'COLUMN',
  'TRUSS_HOUSING',
  'SCREEN_FRAME',
]

// ── Size thresholds ───────────────────────────────────────────────────────────
/** Minimum length of any axis to even consider a collider */
export const MIN_EXTENT = 0.22
/** Minimum thickness — if all axes shorter than this, treat as decorative */
export const MIN_THICKNESS = 0.018
/** Tall-and-thin pole filter: maxDim > this and minXZ < this → skip */
export const THIN_POLE_MAX = 12
export const THIN_POLE_MIN_XZ = 0.35

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the collider role of a mesh.
 *
 * @param {string}   meshName      - THREE mesh.name
 * @param {string[]} materialNames - array of material.name for this mesh
 * @returns {'explicit-floor'|'explicit-blocker'|'floor'|'blocker'|'none'}
 */
export function resolveColliderRole(meshName, materialNames) {
  const name = (meshName || '').toUpperCase()

  // 1. Explicit naming prefix — always wins
  if (EXPLICIT_FLOOR_RE.test(name)) return 'explicit-floor'
  if (EXPLICIT_BLOCK_RE.test(name)) return 'explicit-blocker'

  // 2. Build combined token string from mesh name + all material names
  const tokens = tokenize(meshName, ...materialNames)

  // 3. None-check first — drop noise before anything else
  for (const pattern of NONE_PATTERNS) {
    if (tokens.includes(pattern)) return 'none'
  }

  // 4. Floor
  if (FLOOR_PATTERNS.some((p) => tokens.includes(p))) return 'floor'

  // 5. Blocker
  if (BLOCKER_PATTERNS.some((p) => tokens.includes(p))) return 'blocker'

  // 6. Default — unknown meshes become blockers (conservative approach)
  //    Caller can filter by size to keep only large enough surfaces.
  return 'blocker'
}

/**
 * Decide if a mesh bbox is worth a collider given its size.
 * @param {{ x: number, y: number, z: number }} size - THREE.Vector3-like
 * @returns {boolean}
 */
export function isSizeable(size) {
  const maxDim = Math.max(size.x, size.y, size.z)
  const minDim = Math.min(size.x, size.y, size.z)
  if (maxDim < MIN_EXTENT) return false
  if (minDim < MIN_THICKNESS) return false
  // Reject tall-thin poles that aren't real obstacles
  const minXZ = Math.min(size.x, size.z)
  if (maxDim > THIN_POLE_MAX && minXZ < THIN_POLE_MIN_XZ) return false
  return true
}

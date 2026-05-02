import * as THREE from 'three'
import { resolveColliderRole, isSizeable } from './povColliderPolicy'

/**
 * @typedef {Object} PovColliderSpec
 * @property {string} id
 * @property {'floor'|'blocker'|'explicit-floor'|'explicit-blocker'} type
 * @property {[number,number,number]} position  — world-space center [x,y,z]
 * @property {[number,number,number]} halfExtents
 */

/**
 * @typedef {Object} PovColliderBuild
 * @property {PovColliderSpec[]} specs  — all colliders to mount
 * @property {boolean}           hasExplicit — true if at least one COLLIDER_* mesh was found
 * @property {{ meshName:string, role:string, reason:string }[]} debugLog
 */

const _box3 = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()

/**
 * Scan `clonedScene` (already normalized to world origin) and build
 * CuboidCollider specs for POV.
 *
 * Strategy:
 *   - Pass 1: collect all explicit COLLIDER_FLOOR_* / COLLIDER_BLOCK_* meshes.
 *   - If explicit meshes found → only emit those (no heuristic colliders).
 *   - If none → emit heuristic colliders (floor + blocker policy).
 *
 * Called *after* scene.updateMatrixWorld(true) has been invoked.
 *
 * @param {THREE.Object3D} clonedScene
 * @returns {PovColliderBuild}
 */
export function buildPovColliders(clonedScene) {
  clonedScene.updateMatrixWorld(true)

  /** @type {PovColliderSpec[]} */
  const explicitSpecs = []
  /** @type {PovColliderSpec[]} */
  const heuristicSpecs = []
  /** @type {{ meshName:string, role:string, reason:string }[]} */
  const debugLog = []
  let idx = 0

  clonedScene.traverse((child) => {
    if (!child.isMesh) return

    const mats = Array.isArray(child.material) ? child.material : [child.material]
    const matNames = mats.map((m) => m?.name ?? '').filter(Boolean)
    const role = resolveColliderRole(child.name, matNames)

    if (role === 'none') {
      debugLog.push({ meshName: child.name, role, reason: 'policy:none' })
      return
    }

    _box3.setFromObject(child)
    if (_box3.isEmpty()) {
      debugLog.push({ meshName: child.name, role, reason: 'skip:empty-bbox' })
      return
    }

    _box3.getSize(_size)
    _box3.getCenter(_center)

    const isExplicit = role === 'explicit-floor' || role === 'explicit-blocker'

    if (!isExplicit && !isSizeable(_size)) {
      debugLog.push({ meshName: child.name, role, reason: `skip:too-small(${_size.x.toFixed(2)}×${_size.y.toFixed(2)}×${_size.z.toFixed(2)})` })
      return
    }

    const spec = {
      id: `${child.uuid}_${idx++}`,
      type: role,
      position: [_center.x, _center.y, _center.z],
      halfExtents: [
        Math.max(_size.x * 0.5, 0.02),
        Math.max(_size.y * 0.5, 0.02),
        Math.max(_size.z * 0.5, 0.02),
      ],
    }

    if (isExplicit) {
      explicitSpecs.push(spec)
      debugLog.push({ meshName: child.name, role, reason: 'explicit-prefix' })
    } else {
      heuristicSpecs.push(spec)
      debugLog.push({ meshName: child.name, role, reason: 'policy:heuristic' })
    }
  })

  const hasExplicit = explicitSpecs.length > 0
  const specs = hasExplicit ? explicitSpecs : heuristicSpecs

  if (import.meta.env.DEV) {
    const floors = specs.filter((s) => s.type === 'floor' || s.type === 'explicit-floor').length
    const blockers = specs.filter((s) => s.type === 'blocker' || s.type === 'explicit-blocker').length
    console.debug(
      `[POV colliders] ${hasExplicit ? 'EXPLICIT' : 'HEURISTIC'} mode — ` +
        `${specs.length} colliders (${floors} floor, ${blockers} blocker)`
    )
    if (import.meta.env.VITE_POV_COLLIDER_DEBUG === 'true') {
      console.table(debugLog)
    }
  }

  return { specs, hasExplicit, debugLog }
}

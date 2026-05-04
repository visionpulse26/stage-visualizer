import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBlockerSubdivisions, splitColliderSpecsByRole } from './povColliderUtils.js'

function makeMeta(overrides = {}) {
  return {
    id: 'mesh_1',
    center: [0, 1, 0],
    size: { x: 8, y: 2, z: 4 },
    ...overrides,
  }
}

test('returns single collider for small blockers', () => {
  const parts = buildBlockerSubdivisions(makeMeta({ size: { x: 0.6, y: 1.2, z: 0.7 } }))
  assert.equal(parts.length, 1)
  assert.deepEqual(parts[0].position, [0, 1, 0])
})

test('splits large blocker into multiple colliders (tall wall)', () => {
  // A tall vertical wall/backdrop: narrow depth, tall height, big width
  const parts = buildBlockerSubdivisions(makeMeta({ name: 'Backdrop_Wall', center: [0, 3, 0], size: { x: 12, y: 5, z: 0.5 } }))
  assert.ok(parts.length > 1, `expected multiple parts but got ${parts.length}`)
  assert.ok(parts.every((p) => p.halfExtents[0] > 0))
  assert.ok(parts.every((p) => p.halfExtents[2] > 0))
})

test('caps subdivision count for very large meshes', () => {
  const parts = buildBlockerSubdivisions(makeMeta({ size: { x: 60, y: 4, z: 60 } }))
  assert.ok(parts.length <= 96)
})

test('respects blocker role for floor-like meshes', () => {
  const parts = buildBlockerSubdivisions(
    makeMeta({
      name: 'Main Floor Deck',
      materialNames: ['FLOOR_MAT'],
      size: { x: 20, y: 0.3, z: 8 },
    }),
  )
  assert.ok(parts.length > 0)
})

test('respects blocker role for stair-like meshes by name', () => {
  const parts = buildBlockerSubdivisions(
    makeMeta({ name: 'Stage Stair Left', materialNames: [], size: { x: 4, y: 1.8, z: 3 } }),
  )
  assert.ok(parts.length > 0)
})

test('respects blocker role for stair body geometry', () => {
  // e.g. unnamed stair body: 3m wide, 1.5m tall, 2.5m deep, center.y ~0.75
  const parts = buildBlockerSubdivisions(
    makeMeta({ name: 'Stair_Body_002', materialNames: [], center: [0, 0.75, 0], size: { x: 3, y: 1.5, z: 2.5 } }),
  )
  assert.ok(parts.length > 0)
})

test('respects blocker role for long low floor decks', () => {
  const parts = buildBlockerSubdivisions(
    makeMeta({ name: 'FORMAT_01', materialNames: [], center: [0, 1.2, 0], size: { x: 18, y: 1.4, z: 3 } }),
  )
  assert.ok(parts.length > 0)
})

test('keeps named vertical walls as subdivided blockers', () => {
  const parts = buildBlockerSubdivisions(
    makeMeta({ name: 'Stage Backdrop Wall', materialNames: [], center: [0, 3, 0], size: { x: 18, y: 5, z: 0.5 } }),
  )
  assert.ok(parts.length > 1)
})

test('splits floor and blocker specs for debug overlay', () => {
  const out = splitColliderSpecsByRole([
    { id: 'a', type: 'floor' },
    { id: 'b', type: 'explicit-floor' },
    { id: 'c', type: 'blocker' },
    { id: 'd', type: 'explicit-blocker' },
    { id: 'e', type: 'ignore' },
  ])
  assert.deepEqual(out.floors.map((x) => x.id), ['a', 'b'])
  assert.deepEqual(out.blockers.map((x) => x.id), ['c', 'd'])
})


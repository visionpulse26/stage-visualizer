import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectLedSurfaceTarget,
  discoverLedSurfaces,
  formatLedTargetLabel,
  getLedSurfaceKey,
  normalizeLedTargetToken,
  resolveLedTargetId,
  resolveLedTargets,
} from './ledMaterialTargets.js'

test('normalizes semantic mapled material names', () => {
  assert.equal(normalizeLedTargetToken('MAIN'), 'main')
  assert.equal(normalizeLedTargetToken('SIDE'), 'side')
  assert.equal(formatLedTargetLabel('main'), 'Main')
  assert.equal(formatLedTargetLabel('side'), 'Side')

  assert.deepEqual(detectLedSurfaceTarget(['LED_MAPLED_MAIN_MAT'], 'AnyMesh'), {
    surfaceType: 'solid',
    targetId: 'main',
    targetLabel: 'Main',
    sourceName: 'LED_MAPLED_MAIN_MAT',
    sourceKind: 'material',
    isTargeted: true,
  })
})

test('normalizes indexed mapled material names', () => {
  assert.equal(normalizeLedTargetToken('A'), 'a')
  assert.equal(normalizeLedTargetToken('B'), 'b')
  assert.equal(formatLedTargetLabel('a'), 'Mapled A')
  assert.equal(formatLedTargetLabel('b'), 'Mapled B')

  assert.deepEqual(detectLedSurfaceTarget(['LED_MAPLED_B_MAT'], 'AnyMesh'), {
    surfaceType: 'solid',
    targetId: 'b',
    targetLabel: 'Mapled B',
    sourceName: 'LED_MAPLED_B_MAT',
    sourceKind: 'material',
    isTargeted: true,
  })
})

test('uses mesh name as fallback when material is not targeted', () => {
  assert.deepEqual(detectLedSurfaceTarget(['MAT_GENERIC'], 'LED_MAPLED_SIDE_PANEL'), {
    surfaceType: 'solid',
    targetId: 'side',
    targetLabel: 'Side',
    sourceName: 'LED_MAPLED_SIDE_PANEL',
    sourceKind: 'mesh',
    isTargeted: true,
  })
})

test('keeps legacy LED material names as master surfaces', () => {
  assert.deepEqual(detectLedSurfaceTarget(['LED_MASTER_MAT'], 'LED_MAPLED_A_MESH'), {
    surfaceType: 'solid',
    targetId: 'master',
    targetLabel: 'Master LED',
    sourceName: 'LED_MASTER_MAT',
    sourceKind: 'material',
    isTargeted: false,
  })

  assert.deepEqual(detectLedSurfaceTarget(['LED_TRANSPARENT_MAT'], 'Mesh'), {
    surfaceType: 'solid',
    targetId: 'master',
    targetLabel: 'Master LED',
    sourceName: 'LED_TRANSPARENT_MAT',
    sourceKind: 'material',
    isTargeted: false,
  })

  assert.deepEqual(detectLedSurfaceTarget(['LED_TRANSPARENT_MAT.001'], 'Mesh'), {
    surfaceType: 'solid',
    targetId: 'master',
    targetLabel: 'Master LED',
    sourceName: 'LED_TRANSPARENT_MAT.001',
    sourceKind: 'material',
    isTargeted: false,
  })

  assert.deepEqual(detectLedSurfaceTarget(['MAT_GENERIC'], 'Transpa'), {
    surfaceType: 'solid',
    targetId: 'master',
    targetLabel: 'Master LED',
    sourceName: 'Transpa',
    sourceKind: 'mesh',
    isTargeted: false,
  })

  assert.deepEqual(detectLedSurfaceTarget(['LED_GRID_STAR'], 'Mesh'), {
    surfaceType: 'transparent-grid',
    targetId: 'master',
    targetLabel: 'Master LED',
    sourceName: 'LED_GRID_STAR',
    sourceKind: 'material',
    isTargeted: false,
  })
})

test('material target takes priority over mesh target', () => {
  assert.deepEqual(detectLedSurfaceTarget(['LED_MAPLED_MAIN_MAT'], 'LED_MAPLED_SIDE_MESH'), {
    surfaceType: 'solid',
    targetId: 'main',
    targetLabel: 'Main',
    sourceName: 'LED_MAPLED_MAIN_MAT',
    sourceKind: 'material',
    isTargeted: true,
  })
})

// ── Phase A: discovery + role resolution ────────────────────────────────────

test('surface key: convention names key by targetId', () => {
  const surface = getLedSurfaceKey(['LED_MAPLED_MAIN_MAT'], 'Mesh')
  assert.equal(surface.key, 'main')
  assert.equal(surface.matchKind, 'convention')
  assert.equal(surface.isTargeted, true)
})

test('surface key: legacy LED collapses to master', () => {
  const surface = getLedSurfaceKey(['LED_MASTER_MAT'], 'Mesh')
  assert.equal(surface.key, 'master')
  assert.equal(surface.matchKind, 'legacy')
  assert.equal(surface.isTargeted, false)
})

test('surface key: heuristic catches non-convention "LED" names', () => {
  // Real C4D objects with no naming convention still register so they can be
  // mapped in the selector — and stay separable by distinct name.
  const main = getLedSurfaceKey([], 'LED Main')
  const side = getLedSurfaceKey([], 'Led Side')
  assert.equal(main.matchKind, 'heuristic')
  assert.equal(main.key, 'led_main')
  assert.equal(side.key, 'led_side')
  assert.notEqual(main.key, side.key)
})

test('surface key: non-LED mesh returns null', () => {
  assert.equal(getLedSurfaceKey(['MAT_METAL'], 'Truss_01'), null)
})

test('discoverLedSurfaces groups distinct LED maps and ranks convention first', () => {
  const scan = [
    { name: 'Panel_A', materialNames: ['LED_MAPLED_MAIN_MAT'] },
    { name: 'Panel_A2', materialNames: ['LED_MAPLED_MAIN_MAT'] }, // same map → grouped
    { name: 'Panel_B', materialNames: ['LED_MAPLED_SIDE_MAT'] },
    { name: 'LED Side', materialNames: [] },                       // heuristic
    { name: 'Truss', materialNames: ['METAL'] },                   // ignored
  ]
  const surfaces = discoverLedSurfaces(scan)
  assert.deepEqual(surfaces.map((s) => s.key), ['main', 'side', 'led_side'])
  const main = surfaces.find((s) => s.key === 'main')
  assert.equal(main.meshCount, 2)
  assert.equal(main.matchKind, 'convention')
  assert.equal(surfaces.at(-1).matchKind, 'heuristic')
})

test('resolveLedTargets: convention GLB needs zero config', () => {
  const scan = [
    { name: 'A', materialNames: ['LED_MAPLED_MAIN_MAT'] },
    { name: 'B', materialNames: ['LED_MAPLED_SIDE_MAT'] },
  ]
  const targets = resolveLedTargets(scan, {})
  assert.deepEqual(targets.map((t) => t.targetId), ['main', 'side'])
  assert.equal(targets.length, 2)
})

test('resolveLedTargets: legacy single-LED collapses to one master target', () => {
  const scan = [
    { name: 'A', materialNames: ['LED_MASTER_MAT'] },
    { name: 'B', materialNames: ['LED_MASTER_MAT'] },
  ]
  const targets = resolveLedTargets(scan, {})
  assert.deepEqual(targets.map((t) => t.targetId), ['master'])
})

test('ledTargetMap remaps heuristic surfaces to roles and orders them', () => {
  const scan = [
    { name: 'LED Main', materialNames: [] },
    { name: 'Led Side', materialNames: [] },
  ]
  const ledTargetMap = {
    led_main: { targetId: 'main', label: 'Main Wall', order: 0 },
    led_side: { targetId: 'side', label: 'Side Wings', order: 1 },
  }
  const targets = resolveLedTargets(scan, ledTargetMap)
  assert.deepEqual(targets.map((t) => [t.targetId, t.label]), [
    ['main', 'Main Wall'],
    ['side', 'Side Wings'],
  ])

  // render-time routing resolves the same mesh to the mapped targetId
  const routed = resolveLedTargetId([], 'LED Main', ledTargetMap)
  assert.equal(routed.targetId, 'main')
  assert.equal(routed.label, 'Main Wall')
})

test('resolveLedTargetId: convention routes with no map', () => {
  const routed = resolveLedTargetId(['LED_MAPLED_SIDE_MAT'], 'Mesh', {})
  assert.equal(routed.targetId, 'side')
})

test('discoverLedSurfaces tolerates empty/garbage input', () => {
  assert.deepEqual(discoverLedSurfaces([]), [])
  assert.deepEqual(discoverLedSurfaces(undefined), [])
  assert.deepEqual(discoverLedSurfaces([{ name: '', materialNames: null }]), [])
})

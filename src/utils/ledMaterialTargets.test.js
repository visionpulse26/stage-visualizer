import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectLedSurfaceTarget,
  formatLedTargetLabel,
  normalizeLedTargetToken,
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

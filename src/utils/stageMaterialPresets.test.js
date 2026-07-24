import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_STAGE_MATERIAL,
  STAGE_MATERIAL_PRESETS,
  normalizeMaterialTokens,
  resolveStageMaterialPreset,
} from './stageMaterialPresets.js'

test('normalizeMaterialTokens flattens separators to single spaces', () => {
  assert.equal(normalizeMaterialTokens('MAT_STAGE_FLOOR_BLACK', ''), 'MAT STAGE FLOOR BLACK')
  assert.equal(normalizeMaterialTokens('Mat.Truss-Alu'), 'MAT TRUSS ALU')
  assert.equal(normalizeMaterialTokens(null, undefined, ''), '')
})

// ── Regression: underscore patterns were dead ───────────────────────────────
// Patterns are authored with underscores while the incoming name is flattened
// to spaces, so an un-normalized pattern could never match. These are the nine
// patterns that were silently unreachable.
test('underscore patterns match the project naming convention', () => {
  const cases = [
    ['MAT_STAGE_FLOOR_BLACK', 'stage-floor-black'],
    ['MAT_FLOOR_BLACK',       'stage-floor-black'],
    ['MAT_BLACK_FLOOR',       'stage-floor-black'],
    ['MAT_PANEL_BLACK',       'mask-panel-black'],
    ['MAT_TRIM_BLACK',        'mask-panel-black'],
    ['MAT_TRUSS_RUST',        'truss-weathered'],
    ['MAT_RUST_TRUSS',        'truss-weathered'],
    ['MAT_TRUSS_STEEL',       'truss-weathered'],
    ['MAT_TRUSS_IRON',        'truss-weathered'],
  ]
  for (const [name, expected] of cases) {
    assert.equal(resolveStageMaterialPreset(name, '').id, expected, `${name} should resolve to ${expected}`)
  }
})

test('the stage floor resolves to black, not the grey default', () => {
  const preset = resolveStageMaterialPreset('MAT_STAGE_FLOOR_BLACK', 'floorMesh')
  assert.equal(preset.id, 'stage-floor-black')
  assert.equal(preset.settings.color, '#0b0c0f')
  assert.notEqual(preset.settings.color, DEFAULT_STAGE_MATERIAL.color)
})

test('weathered truss wins over aluminium (preset order preserved)', () => {
  assert.equal(resolveStageMaterialPreset('MAT_TRUSS_RUST', '').id, 'truss-weathered')
  assert.equal(resolveStageMaterialPreset('MAT_TRUSS_ALU', '').id, 'truss-aluminum')
})

test('single-word patterns keep matching as before', () => {
  const cases = [
    ['MAT_FORMAT_BLACK', 'mask-panel-black'],
    ['MAT_TRUSS_ALU',    'truss-aluminum'],
    ['MAT_DECK_BLACK',   'stage-floor-black'],
    ['MAT_STAIR',        'stage-floor-black'],
    ['MAT_PLATFORM',     'stage-floor-black'],
    ['MAT_SUPPORT',      'frame-black'],
    ['MAT_RAIL',         'frame-black'],
  ]
  for (const [name, expected] of cases) {
    assert.equal(resolveStageMaterialPreset(name, '').id, expected, `${name} should resolve to ${expected}`)
  }
})

test('unmatched and empty names fall back to the default preset', () => {
  assert.equal(resolveStageMaterialPreset('MAT_SOMETHING_ELSE', '').id, 'default')
  assert.equal(resolveStageMaterialPreset('', '').id, 'default')
  assert.equal(resolveStageMaterialPreset().id, 'default')
  assert.deepEqual(resolveStageMaterialPreset('').settings, DEFAULT_STAGE_MATERIAL)
})

test('every authored pattern is reachable', () => {
  // Guards the class of bug this file fixes: a pattern that no name can hit.
  for (const preset of STAGE_MATERIAL_PRESETS) {
    for (const pattern of preset.patterns) {
      const resolved = resolveStageMaterialPreset(`MAT_${pattern}`, '')
      assert.notEqual(resolved.id, 'default', `pattern ${pattern} is unreachable`)
    }
  }
})

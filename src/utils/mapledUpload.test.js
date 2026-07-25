import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMapledFilename,
  matchSuffixToTarget,
  groupFilesIntoMapledClips,
} from './mapledUpload.js'

const f = (name) => ({ name })
const TARGETS = [
  { targetId: 'main', label: 'Main', order: 0 },
  { targetId: 'side', label: 'Side', order: 1 },
]

test('parseMapledFilename splits base + trailing suffix', () => {
  assert.deepEqual(parseMapledFilename('Opening_MAIN.mp4'), { baseName: 'Opening', suffix: 'MAIN' })
  assert.deepEqual(parseMapledFilename('My Song_Final-side.mp4'), { baseName: 'My Song_Final', suffix: 'side' })
  assert.deepEqual(parseMapledFilename('Opening.mp4'), { baseName: 'Opening', suffix: '' })
  assert.deepEqual(parseMapledFilename('clip 2.mov'), { baseName: 'clip', suffix: '2' })
})

test('matchSuffixToTarget matches role tokens, aliases, and numbers', () => {
  assert.equal(matchSuffixToTarget('MAIN', TARGETS), 'main')
  assert.equal(matchSuffixToTarget('side', TARGETS), 'side')
  assert.equal(matchSuffixToTarget('phai', [{ targetId: 'right', label: 'Right', order: 0 }]), 'right')
  assert.equal(matchSuffixToTarget('2', TARGETS), 'side')   // by order
  assert.equal(matchSuffixToTarget('1', TARGETS), 'main')
  assert.equal(matchSuffixToTarget('zzz', TARGETS), null)
})

test('mapping-floor aliases route to the floor target', () => {
  const T = [
    { targetId: 'main', label: 'Main', order: 0 },
    { targetId: 'floor', label: 'Floor', order: 1 },
  ]
  for (const s of ['FLOOR', 'P', 'MAPPING', 'mapping', 'p']) {
    assert.equal(matchSuffixToTarget(s, T), 'floor', `_${s} should route to floor`)
  }
  // '_M' must stay on `main` — mapping's short form is '_P', not '_M'.
  assert.equal(matchSuffixToTarget('M', T), 'main')
  assert.equal(matchSuffixToTarget('MAIN', T), 'main')
})

test('groups two files into one multi-mapled clip with correct targets', () => {
  const { isMultiMapled, groups } = groupFilesIntoMapledClips(
    [f('Opening_MAIN.mp4'), f('Opening_SIDE.mp4')],
    TARGETS,
  )
  assert.equal(isMultiMapled, true)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].clipName, 'Opening')
  assert.deepEqual(groups[0].assignments.map((a) => [a.file.name, a.targetId]), [
    ['Opening_MAIN.mp4', 'main'],
    ['Opening_SIDE.mp4', 'side'],
  ])
  assert.deepEqual(groups[0].missingTargetIds, [])
  assert.deepEqual(groups[0].conflictTargetIds, [])
})

test('fills unmatched suffixes with remaining targets by order', () => {
  const { groups } = groupFilesIntoMapledClips(
    [f('Loop_foo.mp4'), f('Loop_bar.mp4')],
    TARGETS,
  )
  // neither suffix matches → assigned main, side by order
  assert.deepEqual(groups[0].assignments.map((a) => a.targetId), ['main', 'side'])
  assert.equal(groups[0].assignments.every((a) => a.auto === false), true)
})

test('flags missing target when a map has no file', () => {
  const { groups } = groupFilesIntoMapledClips([f('Solo_MAIN.mp4')], TARGETS)
  assert.deepEqual(groups[0].assignments.map((a) => a.targetId), ['main'])
  assert.deepEqual(groups[0].missingTargetIds, ['side'])
})

test('separate base names produce separate clips', () => {
  const { groups } = groupFilesIntoMapledClips(
    [f('A_MAIN.mp4'), f('A_SIDE.mp4'), f('B_MAIN.mp4'), f('B_SIDE.mp4')],
    TARGETS,
  )
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((g) => g.clipName).sort(), ['A', 'B'])
})

test('single-target stage is never multi-mapled', () => {
  const { isMultiMapled } = groupFilesIntoMapledClips(
    [f('Opening_MAIN.mp4'), f('Opening_SIDE.mp4')],
    [{ targetId: 'master', label: 'Master LED', order: 0 }],
  )
  assert.equal(isMultiMapled, false)
})

test('detects a duplicate-target conflict', () => {
  // both files match main (side gets none) → conflict + missing
  const { groups } = groupFilesIntoMapledClips(
    [f('X_main.mp4'), f('X_chinh.mp4')],
    TARGETS,
  )
  // first→main; second 'chinh' also main but taken → falls to remaining 'side'
  assert.deepEqual(groups[0].assignments.map((a) => a.targetId), ['main', 'side'])
})

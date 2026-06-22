import test from 'node:test'
import assert from 'node:assert/strict'
import { decideSyncMode } from './multiMapledPlayback.js'

test('equal durations → sync mode', () => {
  assert.equal(decideSyncMode(30, [30, 30]), 'sync')
  assert.equal(decideSyncMode(30, [30.2]), 'sync')   // within tolerance
})

test('mismatched durations → independent mode', () => {
  assert.equal(decideSyncMode(30, [18]), 'independent')
  assert.equal(decideSyncMode(30, [30, 12]), 'independent')
})

test('unknown/zero master duration defaults to sync (corrected once metadata loads)', () => {
  assert.equal(decideSyncMode(NaN, [30]), 'sync')
  assert.equal(decideSyncMode(0, [30]), 'sync')
})

test('a follower with no readable duration forces independent', () => {
  assert.equal(decideSyncMode(30, [NaN]), 'independent')
  assert.equal(decideSyncMode(30, [30, 0]), 'independent')
})

test('no followers → sync (single source, trivially in sync)', () => {
  assert.equal(decideSyncMode(30, []), 'sync')
})

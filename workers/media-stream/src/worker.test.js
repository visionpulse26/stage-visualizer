import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseRange, verifyToken } from './worker.js'
import { signStreamToken } from '../../../api/get-stream-token.js'

const SECRET = 'shared-secret'

// ── parseRange ───────────────────────────────────────────────────────────────
test('parseRange: bytes=N-M → {offset, length}', () => {
  assert.deepEqual(parseRange('bytes=100-199'), { offset: 100, length: 100 })
})
test('parseRange: bytes=N- → {offset}', () => {
  assert.deepEqual(parseRange('bytes=500-'), { offset: 500 })
})
test('parseRange: bytes=0- (initial video probe)', () => {
  assert.deepEqual(parseRange('bytes=0-'), { offset: 0 })
})
test('parseRange: bytes=-N → {suffix}', () => {
  assert.deepEqual(parseRange('bytes=-1024'), { suffix: 1024 })
})
test('parseRange: absent / malformed / unsatisfiable → null', () => {
  assert.equal(parseRange(null), null)
  assert.equal(parseRange(''), null)
  assert.equal(parseRange('bytes=abc'), null)
  assert.equal(parseRange('bytes=-'), null)
  assert.equal(parseRange('bytes=200-100'), null) // end < start
})

// ── verifyToken (Web Crypto) agrees with signStreamToken (node:crypto) ────────
test('verifyToken accepts a freshly signed, bound token', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = signStreamToken('proj1', exp, SECRET)
  assert.equal(await verifyToken(token, 'proj1', SECRET), true)
})

test('verifyToken rejects a token signed for a different project', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = signStreamToken('proj1', exp, SECRET)
  assert.equal(await verifyToken(token, 'proj2', SECRET), false)
})

test('verifyToken rejects an expired token', async () => {
  const exp = Math.floor(Date.now() / 1000) - 1
  const token = signStreamToken('proj1', exp, SECRET)
  assert.equal(await verifyToken(token, 'proj1', SECRET), false)
})

test('verifyToken rejects a tampered signature and junk', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = signStreamToken('proj1', exp, SECRET)
  assert.equal(await verifyToken(`${token}00`, 'proj1', SECRET), false)
  assert.equal(await verifyToken('', 'proj1', SECRET), false)
  assert.equal(await verifyToken('no-dot', 'proj1', SECRET), false)
})

test('verifyToken rejects a token signed with a different secret', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = signStreamToken('proj1', exp, 'other-secret')
  assert.equal(await verifyToken(token, 'proj1', SECRET), false)
})

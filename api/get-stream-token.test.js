import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { test } from 'node:test'

import { signStreamToken } from './get-stream-token.js'

const SECRET = 'test-secret'

test('token is `${exp}.${hmacHex}` over `${projectId}:${exp}`', () => {
  const exp = 1700000000
  const token = signStreamToken('proj1', exp, SECRET)
  const [gotExp, gotHmac] = token.split('.')
  assert.equal(Number(gotExp), exp)

  // The Worker recomputes this exact value; keep them in lockstep.
  const expected = crypto.createHmac('sha256', SECRET).update(`proj1:${exp}`).digest('hex')
  assert.equal(gotHmac, expected)
})

test('different project ids produce different signatures for the same exp', () => {
  const exp = 1700000000
  assert.notEqual(signStreamToken('proj1', exp, SECRET), signStreamToken('proj2', exp, SECRET))
})

test('signing is deterministic', () => {
  assert.equal(signStreamToken('p', 42, SECRET), signStreamToken('p', 42, SECRET))
})

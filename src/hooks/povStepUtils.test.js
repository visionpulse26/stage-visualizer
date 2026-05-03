import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldApplyStepAssist } from './povStepUtils.js'

test('returns false when not grounded', () => {
  const ok = shouldApplyStepAssist({
    wantsMove: true,
    grounded: false,
    verticalVelocity: 0,
    obstacleHeight: 0.2,
    maxStepHeight: 0.32,
  })
  assert.equal(ok, false)
})

test('returns true for low obstacle when moving and grounded', () => {
  const ok = shouldApplyStepAssist({
    wantsMove: true,
    grounded: true,
    verticalVelocity: 0.03,
    obstacleHeight: 0.18,
    maxStepHeight: 0.32,
  })
  assert.equal(ok, true)
})

test('returns false for high obstacle', () => {
  const ok = shouldApplyStepAssist({
    wantsMove: true,
    grounded: true,
    verticalVelocity: 0.01,
    obstacleHeight: 0.65,
    maxStepHeight: 0.32,
  })
  assert.equal(ok, false)
})


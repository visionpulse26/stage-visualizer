import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./StageCanvas.jsx', import.meta.url), 'utf8')

test('StageCanvas does not ship perf HUD query gates or bisect toggles', () => {
  const removedDebugMarkers = [
    'shouldShowPerfHud',
    'PerfHud',
    'stageviz:perf',
    'perfNoLogDepth',
    'perfNoPreserveBuffer',
    'perfNoShadows',
    'perfNoBloom',
    'perfNoLedLights',
    'perfNoEnv',
    'perfNoContactShadows',
  ]

  for (const marker of removedDebugMarkers) {
    assert.equal(source.includes(marker), false, `unexpected debug marker: ${marker}`)
  }
})

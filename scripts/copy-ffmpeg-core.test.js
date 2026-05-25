import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('ffmpeg core copy script serves the ESM core expected by module workers', () => {
  const script = read('scripts/copy-ffmpeg-core.mjs')

  assert.match(script, /'@ffmpeg', 'core', 'dist', 'esm'/)
  assert.doesNotMatch(script, /'@ffmpeg', 'core', 'dist', 'umd'/)
  assert.match(script, /'ffmpeg-core\.js', 'ffmpeg-core\.wasm'/)
})

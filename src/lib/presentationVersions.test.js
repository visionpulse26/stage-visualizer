import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('presentation version RPC fallback treats Supabase REST missing RPC as missing function', () => {
  const lib = read('src/lib/presentationVersions.js')

  assert.match(lib, /error\?\.status === 404/)
  assert.match(lib, /error\?\.code === 'PGRST202'/)
  assert.match(lib, /Could not find the function/)
})

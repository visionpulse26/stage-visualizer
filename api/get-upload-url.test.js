import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('media image upload limit allows large high-resolution still images', () => {
  const api = read('api/get-upload-url.js')

  assert.match(api, /const MAX_IMAGE_BYTES = 150 \* 1024 \* 1024/)
})

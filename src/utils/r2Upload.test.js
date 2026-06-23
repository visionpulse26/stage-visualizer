import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('upload errors show media size limit instead of a generic failure', () => {
  const upload = read('src/utils/r2Upload.js')

  assert.match(upload, /File exceeds media upload size limit/i)
  assert.match(upload, /Image is too large\. Use an image 150 MB or smaller\./)
})

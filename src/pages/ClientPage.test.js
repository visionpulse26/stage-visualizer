import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('published version preview banner does not say it is not live', () => {
  const page = read('src/pages/ClientPage.jsx')

  assert.match(page, /version\.status === 'published'/)
  assert.match(page, /Previewing current published version/)
})

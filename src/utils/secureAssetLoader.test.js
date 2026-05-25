import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getCorsFreshAssetUrl } from './secureAssetLoader.js'

test('adds a stable cache buster to R2 public asset URLs', () => {
  const url = 'https://pub-f9edba3dcb4945bbafa2b9f6af8523d8.r2.dev/project/media/file.png'
  const fresh = getCorsFreshAssetUrl(url)

  assert.equal(fresh, `${url}?sv_cors=20260525`)
})

test('preserves existing query params when cache busting R2 URLs', () => {
  const fresh = getCorsFreshAssetUrl('https://pub-f9edba3dcb4945bbafa2b9f6af8523d8.r2.dev/project/media/file.png?x=1')

  assert.equal(fresh, 'https://pub-f9edba3dcb4945bbafa2b9f6af8523d8.r2.dev/project/media/file.png?x=1&sv_cors=20260525')
})

test('does not rewrite non-R2 URLs or blob URLs', () => {
  assert.equal(getCorsFreshAssetUrl('https://example.com/file.png'), 'https://example.com/file.png')
  assert.equal(getCorsFreshAssetUrl('blob:https://stage.tooawake.mov/abc'), 'blob:https://stage.tooawake.mov/abc')
})

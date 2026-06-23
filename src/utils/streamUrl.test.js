import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildVideoStreamUrl } from './streamUrl.js'

const BASE = 'https://media.stage.tooawake.mov'
const TOKEN = '1700000000.abcdef'

test('rewrites an R2 public URL to a tokened Worker /v/ URL', () => {
  const out = buildVideoStreamUrl(
    'https://pub-xxx.r2.dev/proj1/media/123_clip.mp4',
    TOKEN,
    BASE,
  )
  assert.equal(out, `${BASE}/v/proj1/media/123_clip.mp4?t=${encodeURIComponent(TOKEN)}`)
})

test('preserves the full key path including nested segments', () => {
  const out = buildVideoStreamUrl(
    'https://media.example.com/a/b/media/9_x.webm',
    TOKEN,
    BASE,
  )
  assert.equal(out, `${BASE}/v/a/b/media/9_x.webm?t=${encodeURIComponent(TOKEN)}`)
})

test('returns null when token is missing (caller falls back to blob)', () => {
  assert.equal(buildVideoStreamUrl('https://pub-xxx.r2.dev/p/media/1.mp4', '', BASE), null)
  assert.equal(buildVideoStreamUrl('https://pub-xxx.r2.dev/p/media/1.mp4', null, BASE), null)
})

test('returns null when base is missing (streaming not configured)', () => {
  assert.equal(buildVideoStreamUrl('https://pub-xxx.r2.dev/p/media/1.mp4', TOKEN, ''), null)
})

test('returns null for blob:, data:, non-http and malformed URLs', () => {
  assert.equal(buildVideoStreamUrl('blob:https://app/abc', TOKEN, BASE), null)
  assert.equal(buildVideoStreamUrl('data:video/mp4;base64,AAAA', TOKEN, BASE), null)
  assert.equal(buildVideoStreamUrl('not a url', TOKEN, BASE), null)
  assert.equal(buildVideoStreamUrl('', TOKEN, BASE), null)
})

test('token is percent-encoded into the query', () => {
  const out = buildVideoStreamUrl('https://pub.r2.dev/p/media/1.mp4', 'a b/c+d', BASE)
  assert.ok(out.endsWith('?t=a%20b%2Fc%2Bd'))
})

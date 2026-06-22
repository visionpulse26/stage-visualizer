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

test('client maps published slides to playlist clips without relying on index only', () => {
  const page = read('src/pages/ClientPage.jsx')

  assert.match(page, /function findClipForSlide\(slide, playlist, slideIndex = -1\)/)
  assert.match(page, /String\(c\.id\) === String\(slide\.clipId\)/)
  assert.match(page, /c\.name === slide\.title/)
  assert.match(page, /findClipForSlide\(slide, videoPlaylist, slideIndex\)/)
})

test('client applies the first published slide default camera on initial load', () => {
  const page = read('src/pages/ClientPage.jsx')

  assert.match(page, /applySlideDefaultCamera\(snapshotSlides\[0\], hydratedSnap\.cameraPresets/)
  assert.match(page, /function applySlideDefaultCamera/)
  assert.match(page, /setCameraTargetPreset\(cameraTargetPresetRef, preset\)/)
})

test('client drives multi-mapled clips through the lockstep playback controller', () => {
  const page = read('src/pages/ClientPage.jsx')

  assert.match(page, /import \{[^}]*\bisMultiMapledClip\b[^}]*\bgetClipSources\b[^}]*\} from '\.\.\/utils\/mapledMedia'/)
  assert.match(page, /createMapledPlaybackController\(\{/)
  // master + per-target media routed to the canvas
  assert.match(page, /mediaByTarget=\{mediaByTarget\}/)
  assert.match(page, /ledTargetMap=\{ledTargetMap\}/)
  // followers resolved and attached on master load
  assert.match(page, /if \(isMultiMapledClip\(clip\)\) \{/)
})

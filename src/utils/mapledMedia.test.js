import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMultiMapledClip,
  getClipPrimaryUrl,
  getClipSources,
  isMultiMapledClip,
  serializeClipForPlaylist,
} from './mapledMedia.js'

test('builds a multi-mapled clip from targeted uploads', () => {
  const clip = buildMultiMapledClip({
    name: 'Opening',
    index: 3,
    sources: [
      { targetId: 'main', targetLabel: 'Main', url: 'https://cdn/main.mp4', type: 'video' },
      { targetId: 'side', targetLabel: 'Side', url: 'https://cdn/side.mp4', type: 'video' },
    ],
    idFactory: () => 'clip_fixed',
  })

  assert.equal(clip.id, 'clip_fixed')
  assert.equal(clip.name, 'Opening')
  assert.equal(clip.playbackMode, 'multi-mapled')
  assert.equal(clip.type, 'video')
  assert.equal(clip.url, 'https://cdn/main.mp4')
  assert.deepEqual(clip.sources.map((s) => [s.targetId, s.targetLabel, s.url]), [
    ['main', 'Main', 'https://cdn/main.mp4'],
    ['side', 'Side', 'https://cdn/side.mp4'],
  ])
})

test('detects multi-mapled clips and returns source map', () => {
  const clip = {
    playbackMode: 'multi-mapled',
    sources: [
      { targetId: 'a', url: 'a.mp4' },
      { targetId: 'b', url: 'b.mp4' },
    ],
  }

  assert.equal(isMultiMapledClip(clip), true)
  assert.equal(getClipPrimaryUrl(clip), 'a.mp4')
  assert.deepEqual(getClipSources(clip).map((s) => s.targetId), ['a', 'b'])
})

test('keeps single clips backward compatible', () => {
  const clip = { name: 'Single', url: 'single.mp4', type: 'video', external: true }

  assert.equal(isMultiMapledClip(clip), false)
  assert.equal(getClipPrimaryUrl(clip), 'single.mp4')
  assert.deepEqual(getClipSources(clip), [])
  assert.deepEqual(serializeClipForPlaylist(clip), clip)
})

test('serializes multi-mapled clips without dropping sources', () => {
  const serialized = serializeClipForPlaylist({
    id: 'clip_1',
    name: 'Multi',
    url: 'main.mp4',
    type: 'video',
    playbackMode: 'multi-mapled',
    external: true,
    thumbnailUrl: 'thumb.jpg',
    sources: [
      { targetId: 'main', targetLabel: 'Main', url: 'main.mp4', type: 'video', external: true },
      { targetId: 'side', targetLabel: 'Side', url: 'side.mp4', type: 'video', external: true },
    ],
  })

  assert.equal(serialized.playbackMode, 'multi-mapled')
  assert.equal(serialized.url, 'main.mp4')
  assert.equal(serialized.sources.length, 2)
  assert.equal(serialized.sources[1].targetId, 'side')
})

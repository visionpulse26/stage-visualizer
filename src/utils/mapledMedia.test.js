import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMultiMapledClip,
  buildImageMediaByTarget,
  getClipMediaType,
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

test('builds an image-typed clip when sources are images', () => {
  const clip = buildMultiMapledClip({
    name: 'Stills',
    sources: [
      { targetId: 'main', targetLabel: 'Main', url: 'https://cdn/main.png', type: 'image' },
      { targetId: 'side', targetLabel: 'Side', url: 'https://cdn/side.png', type: 'image' },
    ],
    idFactory: () => 'clip_img',
  })

  assert.equal(clip.type, 'image')
})

test('getClipMediaType routes image-sourced clips to the image branch even when clip type is stale video', () => {
  // Legacy clips persisted before the type fix carry clip-level type 'video'
  // while the per-source type is correctly 'image'.
  const stale = {
    type: 'video',
    playbackMode: 'multi-mapled',
    sources: [
      { targetId: 'main', url: 'main.png', type: 'image' },
      { targetId: 'side', url: 'side.png', type: 'image' },
    ],
  }
  assert.equal(getClipMediaType(stale), 'image')

  const video = {
    type: 'video',
    playbackMode: 'multi-mapled',
    sources: [{ targetId: 'main', url: 'main.mp4', type: 'video' }, { targetId: 'side', url: 'side.mp4', type: 'video' }],
  }
  assert.equal(getClipMediaType(video), 'video')

  assert.equal(getClipMediaType({ type: 'image', url: 'x.png' }), 'image')
  assert.equal(getClipMediaType({ url: 'x.mp4' }), 'video')
})

test('buildImageMediaByTarget maps each source to an imageUrl, honouring the resolver', async () => {
  const clip = {
    playbackMode: 'multi-mapled',
    sources: [
      { targetId: 'main', url: 'https://cdn/main.png', type: 'image' },
      { targetId: 'side', url: 'https://cdn/side.png', type: 'image' },
    ],
  }
  const map = await buildImageMediaByTarget(clip, async (u) => `blob:${u}`)
  assert.equal(map.get('main').imageUrl, 'blob:https://cdn/main.png')
  assert.equal(map.get('side').imageUrl, 'blob:https://cdn/side.png')

  // Default resolver is identity
  const plain = await buildImageMediaByTarget(clip)
  assert.equal(plain.get('main').imageUrl, 'https://cdn/main.png')
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

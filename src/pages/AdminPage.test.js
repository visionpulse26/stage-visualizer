import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('admin stage setup starts with no default preview clip — LED panels fall back to material default', () => {
  const page = read('src/pages/AdminPage.jsx')

  // No baked-in default preview — initial state is empty media
  assert.doesNotMatch(page, /DEFAULT_STAGE_PREVIEW_CLIP/)
  assert.doesNotMatch(page, /ensureDefaultPreviewClip/)
  assert.match(page, /clearActiveMedia/)
  // Publish must PRESERVE the live media_playlist (clips owned by StageViz), never
  // overwrite it with the classic editor's cleared in-memory list.
  assert.match(page, /media_playlist:\s+mediaPlaylistForSave/)
  assert.match(page, /mediaPlaylistForSave = existingProject\?\.media_playlist/)
  // The classic editor's clip handlers must not persist media_playlist anymore.
  assert.doesNotMatch(page, /update\(\{ media_playlist: mediaForDb \}\)/)
})

test('stage setup panel removes clip loading controls and links to presentation after publish', () => {
  const panel = read('src/components/UIPanel.jsx')

  // "Default Preview Clip" section removed entirely; Virtual Camera remains
  assert.doesNotMatch(panel, /Default Preview Clip/)
  assert.doesNotMatch(panel, /Default LED Preview/)
  assert.match(panel, /Continue to Presentation/)
  assert.doesNotMatch(panel, /Upload to Cloud \(R2\)/)
  assert.doesNotMatch(panel, /Clear Playlist/)
})

test('admin publish persists media playlist clip ids for presentation clients', () => {
  const page = read('src/pages/AdminPage.jsx')

  assert.match(page, /finalMediaPlaylist = videoPlaylist/)
  assert.match(page, /id: c\.id/)
})

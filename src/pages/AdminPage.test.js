import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('admin stage setup has default preview clip for local stage view but publishes empty playlist', () => {
  const page = read('src/pages/AdminPage.jsx')

  // DEFAULT_STAGE_PREVIEW_CLIP still used for local AdminPage stage view
  assert.match(page, /DEFAULT_STAGE_PREVIEW_CLIP/)
  assert.match(page, /ensureDefaultPreviewClip/)
  // But saved media_playlist is empty — Presentation Editor starts blank
  assert.match(page, /media_playlist:\s+\[\]/)
})

test('stage setup panel removes clip loading controls and links to presentation after publish', () => {
  const panel = read('src/components/UIPanel.jsx')

  assert.match(panel, /Default Preview Clip/)
  assert.match(panel, /Continue to Presentation/)
  assert.doesNotMatch(panel, /Upload to Cloud \(R2\)/)
  assert.doesNotMatch(panel, /Clear Playlist/)
})

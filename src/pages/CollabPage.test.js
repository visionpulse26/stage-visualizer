import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('collab resolves LED targets from scene_config + mesh scan', () => {
  const page = read('src/pages/CollabPage.jsx')

  assert.match(page, /import useLedTargets from '\.\.\/hooks\/useLedTargets'/)
  assert.match(page, /useLedTargets\(meshMetadata, ledTargetMap\)/)
  // ledTargetMap restored from the project scene_config
  assert.match(page, /cfg\.ledTargetMap.*setLedTargetMap\(cfg\.ledTargetMap\)/)
})

test('collab routes multi-mapled media + ledTargetMap to the canvas', () => {
  const page = read('src/pages/CollabPage.jsx')

  assert.match(page, /mediaByTarget=\{mediaByTarget\}/)
  assert.match(page, /ledTargetMap=\{ledTargetMap\}/)
})

test('collab grouped suffix upload goes through the assign modal', () => {
  const page = read('src/pages/CollabPage.jsx')

  assert.match(page, /import MapledAssignModal from '\.\.\/components\/MapledAssignModal'/)
  assert.match(page, /groupFilesIntoMapledClips\(files, ledTargets\)/)
  assert.match(page, /setMapledAssignment\(\{ groups \}\)/)
  // confirmed groups become a synced multi-mapled clip
  assert.match(page, /buildMultiMapledClip\(/)
  assert.match(page, /applyMapledSources\(.*\{ synced: true \}\)/s)
})

test('collab drives grouped clips synced, manual per-map assigns independently', () => {
  const page = read('src/pages/CollabPage.jsx')

  assert.match(page, /createMapledPlaybackController\(\{/)
  // the extra feature: assign a single clip onto one LED map
  assert.match(page, /const assignClipToTarget = useCallback/)
  assert.match(page, /setAssignedClipByTarget\(prev => \(\{ \.\.\.prev, \[targetId\]: clip \}\)\)/)
  assert.match(page, /applyMapledSources\(sources, \{ synced: false \}\)/)
})

test('collab panel exposes multi-file picker + per-map assign controls', () => {
  const panel = read('src/components/CollabPanel.jsx')

  assert.match(panel, /onClipFilesSelected/)
  assert.match(panel, /type="file"\s+multiple/)
  assert.match(panel, /onAssignClipToTarget\(clip, t\.targetId\)/)
  assert.match(panel, /onResetMaps/)
})

test('shared MapledAssignModal is reused by editor + collab', () => {
  const editor = read('src/pages/PresentationEditorPage.jsx')
  const collab = read('src/pages/CollabPage.jsx')

  assert.match(editor, /import MapledAssignModal from '\.\.\/components\/MapledAssignModal'/)
  assert.match(collab, /import MapledAssignModal from '\.\.\/components\/MapledAssignModal'/)
  // editor passes its theme; the modal is themeable
  assert.match(editor, /theme=\{T\}/)
  const modal = read('src/components/MapledAssignModal.jsx')
  assert.match(modal, /export default function MapledAssignModal/)
})

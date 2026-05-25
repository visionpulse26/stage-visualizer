import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { filterDeletableR2Keys } from './r2ReferenceProtection.js'

test('R2 CORS policy allows direct browser uploads', () => {
  const policy = JSON.parse(readFileSync(new URL('../../r2-cors.wrangler.json', import.meta.url), 'utf8'))
  const methods = policy.rules?.[0]?.allowed?.methods ?? []

  assert.ok(methods.includes('GET'))
  assert.ok(methods.includes('HEAD'))
  assert.ok(methods.includes('PUT'))
})

test('does not delete an R2 key referenced by another project', () => {
  const projectRows = [
    {
      id: 'source',
      stage_url: 'https://pub-test.r2.dev/source/stage/main.glb',
      media_playlist: [],
      scene_config: null,
    },
    {
      id: 'clone',
      stage_url: 'https://pub-test.r2.dev/source/stage/main.glb',
      media_playlist: [{ url: 'https://pub-test.r2.dev/source/media/shared.png' }],
      scene_config: null,
    },
  ]

  const result = filterDeletableR2Keys({
    keys: ['source/stage/main.glb', 'source/media/shared.png', 'source/media/orphan.png'],
    projectRows,
    excludingProjectIds: ['source'],
    publicBase: 'https://pub-test.r2.dev',
  })

  assert.deepEqual(result.deletable, ['source/media/orphan.png'])
  assert.deepEqual(result.skippedReferenced.sort(), ['source/media/shared.png', 'source/stage/main.glb'])
})

test('deletes shared R2 keys when all referencing projects are excluded', () => {
  const projectRows = [
    {
      id: 'source',
      stage_url: 'https://pub-test.r2.dev/source/stage/main.glb',
      media_playlist: [],
      scene_config: null,
    },
    {
      id: 'clone',
      stage_url: 'https://pub-test.r2.dev/source/stage/main.glb',
      media_playlist: [],
      scene_config: null,
    },
  ]

  const result = filterDeletableR2Keys({
    keys: ['source/stage/main.glb'],
    projectRows,
    excludingProjectIds: ['source', 'clone'],
    publicBase: 'https://pub-test.r2.dev',
  })

  assert.deepEqual(result.deletable, ['source/stage/main.glb'])
  assert.deepEqual(result.skippedReferenced, [])
})

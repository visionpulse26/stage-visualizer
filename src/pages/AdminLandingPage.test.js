import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('admin routes split landing from stage setup', () => {
  const app = read('src/App.jsx')

  assert.match(app, /AdminLandingPage/)
  assert.match(app, /path="\/admin"/)
  assert.match(app, /path="\/admin\/stage"/)
})

test('admin landing exposes the three primary workspace actions', () => {
  assert.equal(existsSync(new URL('src/pages/AdminLandingPage.jsx', root)), true)
  const page = read('src/pages/AdminLandingPage.jsx')

  assert.match(page, /New Stage/)
  assert.match(page, /Open Stage/)
  assert.match(page, /Recent Presentation/)
  assert.match(page, /Setup stage first/)
})

test('open stage reuses the project manager modal', () => {
  const page = read('src/pages/AdminLandingPage.jsx')

  assert.match(page, /ProjectsDashboard/)
  assert.match(page, /showProjectManager/)
  assert.match(page, /setShowProjectManager\(true\)/)
})

test('recent presentation opens the presentation manager modal', () => {
  const page = read('src/pages/AdminLandingPage.jsx')

  assert.match(page, /PresentationManager/)
  assert.match(page, /showPresentationManager/)
  assert.match(page, /setShowPresentationManager\(true\)/)
})

test('presentation manager opens the draft editor and live client view without version actions', () => {
  assert.equal(existsSync(new URL('src/components/PresentationManager.jsx', root)), true)
  const manager = read('src/components/PresentationManager.jsx')

  assert.match(manager, /onOpenEditor/)
  assert.match(manager, /Client View/)
  assert.match(manager, /window\.open\(`\/view\/\$\{projectId\}`/)
  assert.doesNotMatch(manager, /restoreVersion|versionId|deleteVersion|Trash2|Delete archived|Discard draft/)
})

test('presentation manager hides version rows and emphasizes the stage name', () => {
  const manager = read('src/components/PresentationManager.jsx')

  assert.match(manager, /text-xl/)
  assert.doesNotMatch(manager, /VersionRow/)
  assert.doesNotMatch(manager, /\{archivedCount\} archived/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('presentation editor + Clip uploads multiple video and image files', () => {
  const page = read('src/pages/PresentationEditorPage.jsx')

  assert.match(page, /CLIP_UPLOAD_ACCEPT/)
  assert.match(page, /\.mp4,\.webm,\.mov,\.mkv,\.avi,\.hevc,\.m4v,\.ts,\.wmv,\.flv,\.webp,\.png,\.jpg,\.jpeg,\.gif/)
  assert.match(page, /type="file"[\s\S]*multiple/)
  assert.match(page, /handleUploadClips/)
  assert.match(page, /Array\.from\(filesLike \?\? \[\]\)/)
  assert.match(page, /validatePresentationMediaFile\(file\)/)
  assert.match(page, /shouldTranscodeVideo\(file\)/)
  assert.match(page, /uploadFile = await transcodeToHalfRes\(file/)
  assert.match(page, /getPresignedUploadUrl\(\{[\s\S]*contentLength:\s*uploadFile\.size[\s\S]*type:\s*'media'/)
  assert.match(page, /uploadFileToPresignedUrl\(putUrl, uploadFile, publicUrl/)
  assert.match(page, /makeUploadedClip\(uploadFile, finalUrl, nextClipNumber\)/)
  assert.match(page, /makeSlideFromClip\(clip, baseSlides\.length, cameraPresets\)/)
  assert.match(page, /media_playlist:\s*serializeMediaPlaylistForDb\(nextPlaylist\)/)
})

test('presentation editor runs eligible clip transcodes in a background browser job', () => {
  const page = read('src/pages/PresentationEditorPage.jsx')

  assert.match(page, /ClipTranscodeModal/)
  assert.match(page, /setShowClipTranscodeModal\(true\)/)
  assert.match(page, /beforeunload/)
  assert.match(page, /event\.returnValue = ''/)
  assert.match(page, /setClipBackgroundActive\(true\)/)
})

test('presentation editor can enable audio playback for video clips', () => {
  const page = read('src/pages/PresentationEditorPage.jsx')

  assert.match(page, /audioEnabled/)
  assert.match(page, /handleToggleAudio/)
  assert.match(page, /vid\.muted = !audioEnabled/)
  assert.match(page, /title=\{audioEnabled \? 'Mute audio' : 'Play audio'\}/)
})

test('presentation editor + Clip button opens file picker instead of adding a blank slide', () => {
  const page = read('src/pages/PresentationEditorPage.jsx')

  assert.match(page, /clipUploadInputRef\.current\?\.click\(\)/)
  assert.match(page, /onAdd=\{openClipUploadPicker\}/)
  assert.doesNotMatch(page, /onAdd=\{addSlide\}/)
})

test('presentation editor rejects oversized image clips before requesting an upload URL', () => {
  const page = read('src/pages/PresentationEditorPage.jsx')

  assert.match(page, /const MAX_MEDIA_IMAGE_BYTES = 25 \* 1024 \* 1024/)
  assert.match(page, /function isPresentationImageFile\(file\)/)
  assert.match(page, /isPresentationImageFile\(file\) && file\.size > MAX_MEDIA_IMAGE_BYTES/)
  assert.match(page, /Images must be 25 MB or smaller/)
})

test('presentation editor persists clip ids in project media playlist', () => {
  const page = read('src/pages/PresentationEditorPage.jsx')

  assert.match(page, /function serializeMediaPlaylistForDb\(playlist\)/)
  assert.match(page, /id: c\.id/)
})

import { fetchAsBlobUrlWithCache } from './secureAssetLoader'
import { getPresignedUploadUrl, uploadFileToPresignedUrl } from './r2Upload'

const THUMB_WIDTH = 160
const THUMB_HEIGHT = 90
const THUMB_QUALITY = 0.55

function safeName(value) {
  return String(value || 'clip')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
}

function drawCover(ctx, source, sourceWidth, sourceHeight) {
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = THUMB_WIDTH / THUMB_HEIGHT
  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio
    sx = (sourceWidth - sw) / 2
  } else {
    sh = sourceWidth / targetRatio
    sy = (sourceHeight - sh) / 2
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to encode thumbnail')),
      'image/webp',
      THUMB_QUALITY
    )
  })
}

function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function createImageThumbnailBlob(url) {
  // data: URLs must be used directly — fetching them violates CSP connect-src
  const isDataUrl = url.startsWith('data:')
  const objectUrl = isDataUrl ? url : await fetchAsBlobUrlWithCache(url)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl
    await withTimeout(image.decode(), 8000, 'Image thumbnail')

    const canvas = document.createElement('canvas')
    canvas.width = THUMB_WIDTH
    canvas.height = THUMB_HEIGHT
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'low'
    drawCover(ctx, image, image.naturalWidth || THUMB_WIDTH, image.naturalHeight || THUMB_HEIGHT)
    return canvasToBlob(canvas)
  } finally {
    // only revoke blob: URLs, not data: URLs
    if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
  }
}

async function waitForVideoEvent(video, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onDone)
      video.removeEventListener('error', onError)
    }
    const onDone = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Video thumbnail decode failed')) }
    video.addEventListener(eventName, onDone, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

async function createVideoThumbnailBlob(url) {
  // data: URLs must be used directly — CSP blocks fetch() for data: scheme
  const objectUrl = url.startsWith('data:') ? url : await fetchAsBlobUrlWithCache(url)
  const video = document.createElement('video')
  try {
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    const metadataReady = waitForVideoEvent(video, 'loadedmetadata')
    video.src = objectUrl
    video.load()
    await withTimeout(metadataReady, 10000, 'Video metadata')

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    const targetTime = duration > 0.15 ? Math.min(duration * 0.5, duration - 0.05) : 0
    if (targetTime > 0) {
      const seekReady = waitForVideoEvent(video, 'seeked')
      video.currentTime = targetTime
      await withTimeout(seekReady, 10000, 'Video seek')
    } else {
      if (video.readyState < 2) {
        await withTimeout(waitForVideoEvent(video, 'loadeddata'), 10000, 'Video frame')
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = THUMB_WIDTH
    canvas.height = THUMB_HEIGHT
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'low'
    drawCover(ctx, video, video.videoWidth || THUMB_WIDTH, video.videoHeight || THUMB_HEIGHT)
    return canvasToBlob(canvas)
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    // only revoke blob: URLs, not data: URLs
    if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
  }
}

export async function createClipThumbnailBlob(clip) {
  if (!clip?.url) throw new Error('Clip has no media URL')
  if (clip.type === 'image') return createImageThumbnailBlob(clip.url)
  return createVideoThumbnailBlob(clip.url)
}

export async function createClipThumbnailObjectUrl(clip) {
  const blob = await createClipThumbnailBlob(clip)
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
  }
}

export async function uploadClipThumbnailBlob({ clip, projectId, blob }) {
  const filename = `${safeName(clip.name || clip.id)}_thumb.webp`
  const file = new File([blob], filename, { type: blob.type || 'image/webp' })
  const { putUrl, publicUrl } = await getPresignedUploadUrl({
    filename,
    contentType: file.type,
    contentLength: file.size,
    projectId,
    type: 'media',
  })
  return uploadFileToPresignedUrl(putUrl, file, publicUrl)
}

export async function uploadClipThumbnail({ clip, projectId, onLocalUrl }) {
  const { blob, objectUrl } = await createClipThumbnailObjectUrl(clip)
  onLocalUrl?.(objectUrl)
  return uploadClipThumbnailBlob({ clip, projectId, blob })
}

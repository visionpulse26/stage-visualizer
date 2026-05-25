import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpegInstance = null
let ffmpegLoading = null
const MP4_METADATA_SCAN_BYTES = 8 * 1024 * 1024

export const VIDEO_TRANSCODE_BITRATE_THRESHOLD_BPS = 50_000_000

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoading) return ffmpegLoading

  const ff = new FFmpeg()
  ffmpegLoading = (async () => {
    try {
      await ff.load({
        coreURL: '/ffmpeg/ffmpeg-core.js',
        wasmURL: '/ffmpeg/ffmpeg-core.wasm',
      })
      ffmpegInstance = ff
    } finally {
      ffmpegLoading = null
    }
    return ff
  })()
  return ffmpegLoading
}

function includesAscii(bytes, token) {
  const needle = new TextEncoder().encode(token)
  for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    let matched = true
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}

export function detectMp4VideoCodecFromBytes(bytes) {
  if (!bytes) return 'unknown'
  if (includesAscii(bytes, 'avc1') || includesAscii(bytes, 'avc3')) return 'h264'
  if (includesAscii(bytes, 'hvc1') || includesAscii(bytes, 'hev1')) return 'h265'
  return 'unknown'
}

async function detectMp4VideoCodec(file) {
  if (!file?.slice || !file?.size) return 'unknown'

  const head = new Uint8Array(await file.slice(0, Math.min(file.size, MP4_METADATA_SCAN_BYTES)).arrayBuffer())
  let codec = detectMp4VideoCodecFromBytes(head)
  if (codec !== 'unknown' || file.size <= MP4_METADATA_SCAN_BYTES) return codec

  const tailStart = Math.max(0, file.size - MP4_METADATA_SCAN_BYTES)
  const tail = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer())
  codec = detectMp4VideoCodecFromBytes(tail)
  return codec
}

function canUseObjectUrlMetadataProbe() {
  return typeof document !== 'undefined'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function'
}

function loadVideoElementMetadata(file, timeoutMs = 5000) {
  if (!canUseObjectUrlMetadataProbe()) {
    return Promise.resolve({ canLoadInBrowser: false, durationSeconds: 0 })
  }

  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let done = false
    const cleanup = () => {
      if (done) return false
      done = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      return true
    }
    const finish = (result) => {
      if (!cleanup()) return
      resolve(result)
    }
    const timer = setTimeout(() => {
      finish({ canLoadInBrowser: false, durationSeconds: 0 })
    }, timeoutMs)

    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0
      finish({ canLoadInBrowser: true, durationSeconds })
    }
    video.onerror = () => {
      finish({ canLoadInBrowser: false, durationSeconds: 0 })
    }
    video.src = url
    video.load()
  })
}

export function shouldTranscodeByMetadata({
  codec,
  canLoadInBrowser = false,
  bitrateBps = 0,
} = {}) {
  if (codec === 'h264') return false
  if (codec === 'h265') {
    if (!canLoadInBrowser) return true
    return !Number.isFinite(bitrateBps) || bitrateBps > VIDEO_TRANSCODE_BITRATE_THRESHOLD_BPS
  }
  return true
}

function isVideoLike(file) {
  return Boolean(file?.type?.startsWith('video/'))
    || /\.(mp4|webm|mov|mkv|avi|hevc|m4v|ts|wmv|flv)$/i.test(file?.name || '')
}

function isMp4Like(file) {
  return /\.(mp4|mov|m4v|hevc)$/i.test(file?.name || '')
    || /^(video\/mp4|video\/quicktime|video\/mov)$/i.test(file?.type || '')
}

export async function shouldTranscodeVideo(file) {
  if (!isVideoLike(file)) return false
  if (!isMp4Like(file)) return true

  const codec = await detectMp4VideoCodec(file)
  if (codec === 'h264') return false
  if (codec !== 'h265') return true

  const metadata = await loadVideoElementMetadata(file)
  const bitrateBps = metadata.durationSeconds > 0
    ? (file.size * 8) / metadata.durationSeconds
    : Infinity

  return shouldTranscodeByMetadata({
    codec,
    canLoadInBrowser: metadata.canLoadInBrowser,
    bitrateBps,
  })
}

/**
 * Transcode a video File to H.264 MP4 at half resolution.
 * Images pass through unchanged.
 *
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void, onStatus?: (msg: string) => void }} opts
 * @returns {Promise<File>}
 */
export async function transcodeToHalfRes(file, { onProgress, onStatus } = {}) {
  if (!isVideoLike(file)) return file

  onStatus?.('Loading converter…')
  const ff = await getFFmpeg()

  ff.on('progress', ({ progress }) => {
    onProgress?.(Math.round(progress * 100))
  })

  const inputName = 'input_' + Date.now() + '.' + (file.name.split('.').pop() || 'mp4')
  const outputName = 'output_' + Date.now() + '.mp4'

  onStatus?.('Reading file…')
  await ff.writeFile(inputName, await fetchFile(file))

  onStatus?.('Converting…')
  await ff.exec([
    '-i', inputName,
    '-vf', 'scale=iw/2:ih/2',   // half width × half height
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',                // quality ~good enough for LED preview
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputName,
  ])

  const data = await ff.readFile(outputName)

  await ff.deleteFile(inputName)
  await ff.deleteFile(outputName)

  onStatus?.('Done')
  return new File([data.buffer], file.name.replace(/\.[^/.]+$/, '') + '_converted.mp4', { type: 'video/mp4' })
}

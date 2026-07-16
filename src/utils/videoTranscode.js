import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpegInstance = null
let ffmpegLoading = null
const MP4_METADATA_SCAN_BYTES = 8 * 1024 * 1024

export const VIDEO_TRANSCODE_BITRATE_THRESHOLD_BPS = 50_000_000
// Hardware h264 decoders (NVDEC, most mobile SoCs) cap at 4096×4096; larger
// frames decode to black in Chrome even though metadata/duration load fine.
export const MAX_BROWSER_SAFE_VIDEO_DIM = 4096
// AVCProfileIndication values browsers can decode: ≤100 (Baseline/Main/High
// 8-bit 4:2:0). 110 = High 10, 122 = High 4:2:2, 244 = High 4:4:4 — all
// undecodable in <video> (black frames) despite carrying the `avc1` tag.
export const MAX_BROWSER_SAFE_H264_PROFILE = 100

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

function indexOfAscii(bytes, token) {
  const needle = new TextEncoder().encode(token)
  for (let i = 0; i <= bytes.length - needle.length; i += 1) {
    let matched = true
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return -1
}

function includesAscii(bytes, token) {
  return indexOfAscii(bytes, token) >= 0
}

export function detectMp4VideoCodecFromBytes(bytes) {
  if (!bytes) return 'unknown'
  if (includesAscii(bytes, 'avc1') || includesAscii(bytes, 'avc3')) return 'h264'
  if (includesAscii(bytes, 'hvc1') || includesAscii(bytes, 'hev1')) return 'h265'
  return 'unknown'
}

// AVCProfileIndication from the avcC decoder-config box: content layout is
// configurationVersion(+4), AVCProfileIndication(+5). 0 = box not found.
export function detectH264ProfileFromBytes(bytes) {
  if (!bytes) return 0
  const idx = indexOfAscii(bytes, 'avcC')
  if (idx < 0 || idx + 5 >= bytes.length) return 0
  return bytes[idx + 5]
}

async function scanMp4Metadata(file) {
  if (!file?.slice || !file?.size) return { codec: 'unknown', h264Profile: 0 }

  const head = new Uint8Array(await file.slice(0, Math.min(file.size, MP4_METADATA_SCAN_BYTES)).arrayBuffer())
  let codec = detectMp4VideoCodecFromBytes(head)
  let h264Profile = detectH264ProfileFromBytes(head)
  if ((codec !== 'unknown' && h264Profile > 0) || file.size <= MP4_METADATA_SCAN_BYTES) {
    return { codec, h264Profile }
  }

  // moov (and avcC inside it) may live at the tail of a non-faststart mp4.
  const tailStart = Math.max(0, file.size - MP4_METADATA_SCAN_BYTES)
  const tail = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer())
  if (codec === 'unknown') codec = detectMp4VideoCodecFromBytes(tail)
  if (h264Profile === 0) h264Profile = detectH264ProfileFromBytes(tail)
  return { codec, h264Profile }
}

function canUseObjectUrlMetadataProbe() {
  return typeof document !== 'undefined'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function'
}

function loadVideoElementMetadata(file, timeoutMs = 5000) {
  if (!canUseObjectUrlMetadataProbe()) {
    return Promise.resolve({ canLoadInBrowser: false, durationSeconds: 0, videoWidth: 0, videoHeight: 0 })
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
      finish({ canLoadInBrowser: false, durationSeconds: 0, videoWidth: 0, videoHeight: 0 })
    }, timeoutMs)

    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0
      finish({
        canLoadInBrowser: true,
        durationSeconds,
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0,
      })
    }
    video.onerror = () => {
      finish({ canLoadInBrowser: false, durationSeconds: 0, videoWidth: 0, videoHeight: 0 })
    }
    video.src = url
    video.load()
  })
}

export function shouldTranscodeByMetadata({
  codec,
  canLoadInBrowser = false,
  bitrateBps = 0,
  h264Profile = 0,
  videoWidth = 0,
  videoHeight = 0,
} = {}) {
  if (codec === 'h264') {
    // avc1 tag alone doesn't mean the browser can decode it.
    if (h264Profile > MAX_BROWSER_SAFE_H264_PROFILE) return true       // High 10 / 4:2:2 / 4:4:4
    if (!canLoadInBrowser) return true
    return Math.max(videoWidth, videoHeight) > MAX_BROWSER_SAFE_VIDEO_DIM // hw decoders cap at 4096
  }
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

  const { codec, h264Profile } = await scanMp4Metadata(file)
  if (codec !== 'h264' && codec !== 'h265') return true
  // Unsupported h264 flavor — no need to probe the video element, it would
  // load metadata fine (container parses) while frames stay black.
  if (codec === 'h264' && h264Profile > MAX_BROWSER_SAFE_H264_PROFILE) return true

  const metadata = await loadVideoElementMetadata(file)
  const bitrateBps = metadata.durationSeconds > 0
    ? (file.size * 8) / metadata.durationSeconds
    : Infinity

  return shouldTranscodeByMetadata({
    codec,
    canLoadInBrowser: metadata.canLoadInBrowser,
    bitrateBps,
    h264Profile,
    videoWidth: metadata.videoWidth,
    videoHeight: metadata.videoHeight,
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
    // Half size, forced to EVEN dimensions (libx264 rejects odd width/height).
    '-vf', 'scale=trunc(iw/4)*2:trunc(ih/4)*2',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',                // quality ~good enough for LED preview
    // 8-bit 4:2:0 — without this, 10-bit/4:2:2 sources (ProRes, HEVC) produce
    // High 10 / High 4:2:2 h264 that browsers cannot decode (black frames).
    '-pix_fmt', 'yuv420p',
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

// True when the mp4's `moov` atom precedes `mdat` — i.e. the file is already
// "faststart" (progressive). Such files stream and seek immediately, so they
// need no remux. A non-faststart mp4 keeps `moov` at the very end, forcing the
// browser to fetch the tail before the first frame and stalling follower seeks
// in multi-mapled lockstep.
export function detectFaststartFromBytes(bytes) {
  if (!bytes) return false
  const moov = indexOfAscii(bytes, 'moov')
  const mdat = indexOfAscii(bytes, 'mdat')
  if (moov < 0) return false   // moov not in the head → it's at the end
  if (mdat < 0) return true    // moov present, mdat not seen yet → moov is early
  return moov < mdat
}

async function isFaststartMp4(file) {
  if (!isMp4Like(file) || !file?.slice) return false
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, MP4_METADATA_SCAN_BYTES)).arrayBuffer())
  return detectFaststartFromBytes(head)
}

/**
 * Ensure an mp4 streams well: relocate `moov` to the front via a cheap remux
 * (`-c copy -movflags +faststart`) — no re-encode, no quality loss. No-op for
 * non-video, non-mp4, or already-faststart files (and returns BEFORE loading
 * ffmpeg for those, so image uploads pay nothing).
 *
 * Use this on the upload path for videos that skip transcodeToHalfRes (already
 * browser-friendly h264) — transcoded files already get +faststart.
 *
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void, onStatus?: (msg: string) => void }} opts
 * @returns {Promise<File>}
 */
export async function ensureFaststartMp4(file, { onProgress, onStatus } = {}) {
  if (!isVideoLike(file) || !isMp4Like(file)) return file
  if (await isFaststartMp4(file)) return file

  onStatus?.('Optimizing for streaming…')
  const ff = await getFFmpeg()
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)))

  const inputName = 'fsin_' + Date.now() + '.' + (file.name.split('.').pop() || 'mp4')
  const outputName = 'fsout_' + Date.now() + '.mp4'

  await ff.writeFile(inputName, await fetchFile(file))
  await ff.exec(['-i', inputName, '-c', 'copy', '-movflags', '+faststart', '-y', outputName])
  const data = await ff.readFile(outputName)

  await ff.deleteFile(inputName)
  await ff.deleteFile(outputName)

  onStatus?.('Done')
  return new File([data.buffer], file.name, { type: 'video/mp4' })
}

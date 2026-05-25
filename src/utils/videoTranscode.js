import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpegInstance = null
let ffmpegLoading = null

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoading) return ffmpegLoading

  const ff = new FFmpeg()
  ffmpegLoading = (async () => {
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    try {
      await ff.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpegInstance = ff
    } finally {
      ffmpegLoading = null
    }
    return ff
  })()
  return ffmpegLoading
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
  if (!file.type.startsWith('video/')) return file

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
    '-preset', 'fast',
    '-crf', '26',                // quality ~good enough for LED preview
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

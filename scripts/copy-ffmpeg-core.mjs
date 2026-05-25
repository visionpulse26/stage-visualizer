import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd')
const dest = join(root, 'public', 'ffmpeg')

if (!existsSync(src)) {
  console.warn('[copy-ffmpeg-core] source not found, skipping:', src)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(join(src, file), join(dest, file))
  console.log('[copy-ffmpeg-core] copied', file)
}

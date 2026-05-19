/**
 * Merge `.env.local` / `.env` from the repo root into `process.env` when values are missing
 * or empty. Fixes `vercel dev` not always injecting local secrets into serverless handlers.
 * On Vercel production the files are absent — no-op. Never logs secret values.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let didLoad = false

export function loadRepoEnvLocalOnce() {
  if (didLoad) return
  didLoad = true
  try {
    const libDir = path.dirname(fileURLToPath(import.meta.url))
    const repoRoot = path.resolve(libDir, '..', '..')
    const stripBom = (s) => (typeof s === 'string' ? s.replace(/^\uFEFF/, '') : '')

    for (const fname of ['.env.local', '.env']) {
      const fp = path.join(repoRoot, fname)
      if (!fs.existsSync(fp)) continue
      const text = stripBom(fs.readFileSync(fp, 'utf8'))
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq <= 0) continue
        const key = line.slice(0, eq).trim()
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
        let val = line.slice(eq + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        const cur = process.env[key]
        if (cur === undefined || String(cur).trim() === '') {
          process.env[key] = val
        }
      }
    }
  } catch (e) {
    console.warn('[loadRepoEnvLocalOnce]', e?.message || e)
  }
}

/**
 * One-time local setup: copy .env.example → .env.local if missing.
 * Run: npm run setup:local
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Parent of scripts/ = project root (do not use path.dirname on this path)
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[/\\]$/, '')
const example = path.join(root, '.env.example')
const local = path.join(root, '.env.local')

if (!fs.existsSync(example)) {
  console.error('Missing .env.example — are you in the project root?')
  process.exit(1)
}

if (fs.existsSync(local)) {
  console.log('.env.local already exists — leaving it unchanged.')
  process.exit(0)
}

fs.copyFileSync(example, local)
console.log('Created .env.local from .env.example — fill in secrets, then run: npm run dev:local')

/**
 * Vercel Serverless: POST /api/get-upload-url
 * Returns a presigned PUT URL for direct upload to Cloudflare R2.
 * Body: { filename, contentType, contentLength, projectId, type: 'media' | 'hdri' | 'stage' | 'snapshot' }
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
 * Header: Authorization: Bearer <Supabase access token>
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || ''
// audit m3: feedback snapshots optionally live in a private (non-public-domain)
// bucket. If R2_PRIVATE_BUCKET is set, snapshots upload there and must be
// fetched via /api/get-snapshot-url for signed GET access.
const R2_PRIVATE_BUCKET = process.env.R2_PRIVATE_BUCKET || ''
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()

const ALLOWED_MIME = {
  stage: ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'],
  hdri: ['image/x-hdr', 'image/vnd.radiance', 'image/hdr', 'application/octet-stream'],
  snapshot: ['image/webp', 'image/png', 'image/jpeg'],
  media: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'application/octet-stream'],
}

const MAX_BYTES = {
  stage: 200 * 1024 * 1024,
  hdri: 80 * 1024 * 1024,
  snapshot: 4 * 1024 * 1024,
  media: 500 * 1024 * 1024,
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

const ALLOWED_EXTENSIONS = {
  stage: ['.glb', '.gltf'],
  hdri: ['.hdr', '.exr'],
  snapshot: ['.webp', '.png', '.jpg', '.jpeg'],
  media: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov'],
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

function randomSuffix() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  } catch (_) { /* fall through */ }
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8)
}

function sanitizeKey(projectId, type, filename) {
  const safeProject = (projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.')
  const ts = Date.now()
  if (type === 'stage') {
    return `${safeProject}/stage/${ts}_${base}`
  }
  if (type === 'hdri') {
    return `${safeProject}/hdri/${ts}_${base}`
  }
  if (type === 'snapshot') {
    // Append non-guessable UUID so snapshot keys can't be enumerated by anyone with project id.
    return `${safeProject}/feedback-snapshots/${ts}_${randomSuffix()}_${base}`
  }
  return `${safeProject}/media/${ts}_${base}`
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
}

function createAuthedSupabaseClient(bearer) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  })
}

async function isAuthorizedUpload(req) {
  const bearer = getBearerToken(req)
  if (!bearer || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null

  try {
    const supabase = createAuthedSupabaseClient(bearer)
    const { data, error } = await supabase.auth.getUser(bearer)
    if (error || !data?.user?.id) return null
    return data.user
  } catch (_) {
    return null
  }
}

// Authenticated-only authorization. The `projects` table has no `owner_id` column
// (the per-project ownership schema was never migrated), so we accept any signed-in
// Supabase user — matching the main repo's origin-trust model.
async function canUploadForProject(user) {
  if (!user?.id) return { ok: false, reason: 'no_user' }
  return { ok: true }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await isAuthorizedUpload(req)
  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized',
      bearerProvided: Boolean(req.headers.authorization),
      supabaseAuthConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    })
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    const missing = [
      ['R2_ACCOUNT_ID', R2_ACCOUNT_ID],
      ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
      ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
      ['R2_BUCKET', R2_BUCKET],
    ].filter(([, value]) => !value).map(([name]) => name)
    return res.status(500).json({
      error: 'Server configuration error. Please contact support.',
      ...(process.env.NODE_ENV !== 'production' ? { missing } : {}),
    })
  }

  const { filename, contentType, contentLength, projectId, type = 'media' } = req.body || {}
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid filename' })
  }
  if (!contentType || typeof contentType !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid contentType' })
  }
  if (type !== 'media' && type !== 'hdri' && type !== 'stage' && type !== 'snapshot') {
    return res.status(400).json({ error: 'type must be "media", "hdri", "stage", or "snapshot"' })
  }
  const projectAllowed = await canUploadForProject(user)
  if (!projectAllowed.ok) {
    return res.status(403).json({
      error: 'Forbidden',
      ...(process.env.NODE_ENV !== 'production' ? { diagnostic: projectAllowed } : {}),
    })
  }
  const bytes = Number(contentLength)
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return res.status(400).json({ error: 'Missing or invalid contentLength' })
  }
  const lowerName = filename.toLowerCase()
  const mimeAllowed = ALLOWED_MIME[type]?.includes(contentType)
  const extAllowed  = ALLOWED_EXTENSIONS[type]?.some((ext) => lowerName.endsWith(ext))
  // Accept when MIME matches; also accept application/octet-stream if the extension is on the allowlist
  // (handles Windows/Linux where .mov files may have no MIME type reported by the browser).
  if (!mimeAllowed || (contentType === 'application/octet-stream' && !extAllowed)) {
    if (!mimeAllowed && !extAllowed) {
      return res.status(400).json({ error: `Unsupported contentType for ${type}` })
    }
  }
  if (!extAllowed) {
    return res.status(400).json({ error: `Unsupported file extension for ${type}` })
  }

  // For image-size quota, treat application/octet-stream as video (conservative)
  const isImage = contentType.startsWith('image/')
    || (!contentType || contentType === 'application/octet-stream'
        ? lowerName.match(/\.(png|jpe?g|webp|gif)$/) !== null
        : false)
  const maxBytes = type === 'media' && isImage
    ? MAX_IMAGE_BYTES
    : MAX_BYTES[type]
  if (bytes > maxBytes) {
    return res.status(400).json({ error: `File exceeds ${type} upload size limit` })
  }

  const key = sanitizeKey(projectId, type, filename)
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })

  const usePrivateBucket = type === 'snapshot' && !!R2_PRIVATE_BUCKET
  const bucketName = usePrivateBucket ? R2_PRIVATE_BUCKET : R2_BUCKET

  try {
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
      ContentLength: bytes,
    })
    const expiresIn = 300
    const putUrl = await getSignedUrl(s3, putCommand, { expiresIn })

    // Private snapshots have no public URL — client must fetch via
    // /api/get-snapshot-url which mints a short-lived signed GET URL.
    const publicUrl = usePrivateBucket
      ? null
      : (R2_PUBLIC_BASE_URL
        ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
        : null)

    return res.status(200).json({
      putUrl,
      publicUrl,
      privateKey: usePrivateBucket ? key : null,
      key,
    })
  } catch (err) {
    console.error('[get-upload-url]', err)
    return res.status(500).json({ error: 'Failed to generate upload URL' })
  }
}

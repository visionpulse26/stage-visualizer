/**
 * Vercel Serverless: POST /api/get-upload-url
 * Returns a presigned PUT URL for direct upload to Cloudflare R2.
 * Body: { filename, contentType, projectId, type: 'media' | 'hdri' }
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL, UPLOAD_SECRET
 * Header: x-upload-token must match UPLOAD_SECRET (same value as VITE_UPLOAD_SECRET on the client).
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || ''
const UPLOAD_SECRET = process.env.UPLOAD_SECRET

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

function sanitizeKey(projectId, type, filename) {
  const safeProject = (projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.')
  if (type === 'hdri') {
    return `${safeProject}/hdri/${Date.now()}_${base}`
  }
  return `${safeProject}/media/${Date.now()}_${base}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const uploadToken = req.headers['x-upload-token']
  if (!UPLOAD_SECRET || uploadToken !== UPLOAD_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return res.status(500).json({
      error: 'Server configuration error. Please contact support.',
    })
  }

  const { filename, contentType, projectId, type = 'media' } = req.body || {}
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid filename' })
  }
  if (!contentType || typeof contentType !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid contentType' })
  }
  if (type !== 'media' && type !== 'hdri') {
    return res.status(400).json({ error: 'type must be "media" or "hdri"' })
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

  try {
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    })
    const expiresIn = 3600
    const putUrl = await getSignedUrl(s3, putCommand, { expiresIn })

    const publicUrl = R2_PUBLIC_BASE_URL
      ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
      : null

    return res.status(200).json({
      putUrl,
      publicUrl,
      key,
    })
  } catch (err) {
    console.error('[get-upload-url]', err)
    return res.status(500).json({ error: 'Failed to generate upload URL' })
  }
}

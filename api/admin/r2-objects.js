/**
 * Vercel Serverless: GET /api/admin/r2-objects?prefix=<projectPrefix>
 * Lists R2 objects under a prefix (authenticated admin only).
 */

import { getBearerToken, verifyBearerUser } from '../lib/adminApiCommon.js'
import { createR2S3Client, getR2BucketName, listAllObjectsUnderPrefix } from '../lib/r2Admin.js'

function normalizePrefix(raw) {
  if (raw == null) return ''
  let p = String(raw).trim()
  if (!p) return ''
  p = p.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_/-]/g, '_')
  if (!p.endsWith('/')) p = `${p}/`
  return p
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await verifyBearerUser(getBearerToken(req))
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const prefix = normalizePrefix(req.query?.prefix)
  if (!prefix || prefix === '/') {
    return res.status(400).json({ error: 'Missing or invalid prefix query param' })
  }

  let s3
  let bucket
  try {
    s3 = createR2S3Client()
    bucket = getR2BucketName()
  } catch (e) {
    console.error('[admin-r2-objects]', e)
    return res.status(500).json({
      error: 'R2 not configured',
      ...(process.env.NODE_ENV !== 'production' && e.missing ? { missing: e.missing } : {}),
    })
  }

  try {
    const objects = await listAllObjectsUnderPrefix(s3, bucket, prefix)
    return res.status(200).json(objects)
  } catch (e) {
    console.error('[admin-r2-objects]', e)
    return res.status(500).json({ error: 'Failed to list R2 objects' })
  }
}

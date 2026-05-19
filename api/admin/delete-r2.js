/**
 * Vercel Serverless: POST /api/admin/delete-r2
 * Body: { keys: string[] }
 * Batch-deletes up to 1000 keys per internal request (S3 limit).
 */

import { getBearerToken, verifyBearerUser } from '../lib/adminApiCommon.js'
import { createR2S3Client, getR2BucketName, deleteObjectKeys } from '../lib/r2Admin.js'

/** First segment = project folder; remainder must not path-traverse. */
function isAllowedKey(key) {
  if (typeof key !== 'string' || key.length < 3 || key.length > 2048) return false
  if (key.includes('..') || key.startsWith('/')) return false
  const m = /^([a-zA-Z0-9_-]+)\/(.+)$/.exec(key)
  if (!m) return false
  const rest = m[2]
  if (rest.includes('..') || rest.startsWith('/')) return false
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await verifyBearerUser(getBearerToken(req))
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const keys = req.body?.keys
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: 'Body must include non-empty keys array' })
  }

  const rejected = []
  const allowed = []
  for (const k of keys) {
    if (isAllowedKey(k)) allowed.push(k)
    else rejected.push(k)
  }

  let s3
  let bucket
  try {
    s3 = createR2S3Client()
    bucket = getR2BucketName()
  } catch (e) {
    console.error('[admin-delete-r2]', e)
    return res.status(500).json({
      error: 'R2 not configured',
      ...(process.env.NODE_ENV !== 'production' && e.missing ? { missing: e.missing } : {}),
    })
  }

  try {
    const { deleted, failed } = await deleteObjectKeys(s3, bucket, allowed)
    return res.status(200).json({
      deleted,
      failed: [...failed, ...rejected.map((key) => ({ key, message: 'Key rejected by policy' }))],
    })
  } catch (e) {
    console.error('[admin-delete-r2]', e)
    return res.status(500).json({ error: 'Failed to delete R2 objects' })
  }
}

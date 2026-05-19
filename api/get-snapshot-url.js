/**
 * Vercel Serverless: GET /api/get-snapshot-url?key=...
 *
 * Audit m3: feedback snapshots live in a private R2 bucket. This endpoint
 * verifies the caller is an authenticated user with access to the project
 * implied by the key prefix, then mints a short-lived signed GET URL.
 *
 * Env:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   R2_PRIVATE_BUCKET (required — if unset, route returns 503 to keep callers
 *     on the legacy public path).
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Header: Authorization: Bearer <Supabase access token>
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_PRIVATE_BUCKET = process.env.R2_PRIVATE_BUCKET || ''
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
}

async function getRequester(req) {
  const bearer = getBearerToken(req)
  if (!bearer || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
    const { data, error } = await supabase.auth.getUser(bearer)
    if (error || !data?.user?.id) return null
    return data.user
  } catch (_) { return null }
}

function projectIdFromKey(key) {
  if (typeof key !== 'string') return null
  const m = key.match(/^([a-zA-Z0-9_-]+)\/feedback-snapshots\//)
  return m ? m[1] : null
}

async function canReadProjectSnapshots(user, projectId) {
  if (!user?.id || !projectId) return false
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') return false
    if (!data) return false
    return data.owner_id === user.id
  } catch (_) { return false }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!R2_PRIVATE_BUCKET) return res.status(503).json({ error: 'private bucket not configured' })
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: 'r2 not configured' })
  }

  const user = await getRequester(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const key = typeof req.query.key === 'string' ? req.query.key : ''
  if (!key || key.includes('..') || key.includes('\0')) {
    return res.status(400).json({ error: 'invalid key' })
  }

  const projectId = projectIdFromKey(key)
  if (!projectId) return res.status(400).json({ error: 'unrecognized key path' })

  const ok = await canReadProjectSnapshots(user, projectId)
  if (!ok) return res.status(403).json({ error: 'Forbidden' })

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })

  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: R2_PRIVATE_BUCKET, Key: key }),
      { expiresIn: 300 },
    )
    return res.status(200).json({ url, expiresIn: 300 })
  } catch (err) {
    return res.status(500).json({ error: 'failed to sign url' })
  }
}

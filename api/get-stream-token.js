/**
 * Vercel Serverless: POST /api/get-stream-token
 * Mints a short-lived HMAC token the media-stream Worker validates before
 * streaming a project's video from R2 (HTTP Range). The token is opaque to the
 * client: `${exp}.${hmacHex}` where hmac = HMAC-SHA256(secret, `${projectId}:${exp}`).
 * The Worker derives projectId from the object key prefix and recomputes — so a
 * token for project A cannot stream project B's objects.
 *
 * Authorization mirrors the app's anon-read posture:
 *   - anon viewers  → allowed only when the project is published (present in the
 *                     anon-readable `projects_client_public` view).
 *   - authed users  → allowed for any project (matches the lax upload model in
 *                     get-upload-url.js).
 *
 * Body: { projectId }
 * Header: Authorization: Bearer <Supabase access token>  (optional)
 * Env: MEDIA_STREAM_SECRET (required — server only, NOT a VITE_ var),
 *      SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * Returns 503 when MEDIA_STREAM_SECRET is unset so the client falls back to the
 * blob loader (streaming infra not deployed yet).
 */

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const MEDIA_STREAM_SECRET = (process.env.MEDIA_STREAM_SECRET || '').trim()
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()

// 6h — long enough that a viewing session won't outlive its token mid-stream
// (an expired token 403s the next Range request and stalls playback). The
// client also refreshes shortly before expiry.
const STREAM_TOKEN_TTL_SECONDS = 6 * 60 * 60

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
}

async function getAuthedUser(bearer) {
  if (!bearer || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
    const { data, error } = await supabase.auth.getUser(bearer)
    if (error || !data?.user?.id) return null
    return data.user
  } catch (_) {
    return null
  }
}

// Published projects are readable by anon through the sanitizing view. Querying
// it with the anon key returns a row only when the project is publicly viewable.
async function isPublishedProject(projectId) {
  if (!projectId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase
      .from('projects_client_public')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') return false
    return Boolean(data)
  } catch (_) {
    return false
  }
}

/** Sign `${exp}.${hmacHex}` binding the token to a project id and expiry. */
export function signStreamToken(projectId, exp, secret) {
  const hmac = crypto.createHmac('sha256', secret).update(`${projectId}:${exp}`).digest('hex')
  return `${exp}.${hmac}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!MEDIA_STREAM_SECRET) {
    // Streaming infra not configured — client falls back to the blob loader.
    return res.status(503).json({ error: 'streaming not configured' })
  }

  const { projectId } = req.body || {}
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid projectId' })
  }

  const user = await getAuthedUser(getBearerToken(req))
  const allowed = user ? true : await isPublishedProject(projectId)
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const exp = Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SECONDS
  const token = signStreamToken(projectId, exp, MEDIA_STREAM_SECRET)
  return res.status(200).json({ token, exp })
}

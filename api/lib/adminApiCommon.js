/**
 * Shared helpers for authenticated admin serverless routes.
 * Pattern: verify Supabase JWT (Bearer), then use service role for DB where needed.
 */

import { createClient } from '@supabase/supabase-js'
import { loadRepoEnvLocalOnce } from './loadRepoEnvFiles.js'

loadRepoEnvLocalOnce()

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
}

export function supabaseUrlFromEnv() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
}

export function supabaseAnonKeyFromEnv() {
  return (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
}

export async function verifyBearerUser(bearer) {
  if (!bearer || !supabaseUrlFromEnv() || !supabaseAnonKeyFromEnv()) return null
  const supabase = createClient(supabaseUrlFromEnv(), supabaseAnonKeyFromEnv(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  const { data, error } = await supabase.auth.getUser(bearer)
  if (error || !data?.user?.id) return null
  return data.user
}

/** Supabase client using the caller's JWT (respects RLS). Use when service role is unavailable. */
export function createSessionScopedClient(bearer) {
  if (!bearer || !supabaseUrlFromEnv() || !supabaseAnonKeyFromEnv()) return null
  return createClient(supabaseUrlFromEnv(), supabaseAnonKeyFromEnv(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  })
}

function normalizeSecretKey(raw) {
  if (raw == null) return ''
  let s = String(raw).trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  return s
}

export function getServiceRoleClient() {
  const url = supabaseUrlFromEnv()
  const key = normalizeSecretKey(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function publicR2BaseFromEnv() {
  return (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

/**
 * Map a public asset URL to an R2 object key for the configured public bucket.
 * Returns null when the URL is not clearly an R2 object for this deployment.
 */
export function urlToR2ObjectKey(url, publicBase) {
  if (!url || typeof url !== 'string') return null
  const u = url.trim().split('?')[0]
  if (!u || u.startsWith('blob:')) return null
  const base = (publicBase || '').replace(/\/$/, '')
  if (base && u.startsWith(`${base}/`)) {
    return u.slice(base.length + 1)
  }
  try {
    const parsed = new URL(u)
    if (base) {
      try {
        const b = new URL(base.startsWith('http') ? base : `https://${base}`)
        if (parsed.origin === b.origin && parsed.pathname.length > 1) {
          return parsed.pathname.replace(/^\//, '')
        }
      } catch {
        /* ignore */
      }
    }
    const path = parsed.pathname.replace(/^\//, '')
    if (/(^|\/)(stage|hdri|media|feedback-snapshots)\//.test(path)) {
      return path
    }
  } catch {
    /* ignore */
  }
  return null
}

export function collectReferencedR2KeysFromProject(project, publicBase) {
  const keys = new Set()
  const add = (u) => {
    const k = urlToR2ObjectKey(u, publicBase)
    if (k) keys.add(k)
  }
  if (project?.stage_url) add(project.stage_url)
  const cfg = project?.scene_config
  if (cfg && typeof cfg === 'object' && cfg.customHdriUrl) add(cfg.customHdriUrl)
  const pl = project?.media_playlist
  if (Array.isArray(pl)) {
    for (const item of pl) {
      if (!item || typeof item !== 'object') continue
      if (item.url) add(item.url)
      const thumb = item.thumbnailUrl || item.thumbnail_url
      if (thumb) add(thumb)
    }
  }
  return keys
}

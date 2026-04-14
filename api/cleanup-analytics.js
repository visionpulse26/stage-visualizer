/**
 * Vercel Serverless: GET /api/cleanup-analytics
 * Deletes client analytics rows older than RETENTION_DAYS (default 90).
 * Requires Supabase service role. Intended for Vercel Cron (see vercel.json).
 *
 * Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Optional: CRON_SECRET — if set, allow manual runs with Authorization: Bearer <CRON_SECRET>
 * Optional: RETENTION_DAYS (default 90)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const cronSecret = (process.env.CRON_SECRET || '').trim()
const retentionDays = Math.max(1, Math.min(365, parseInt(process.env.RETENTION_DAYS || '90', 10) || 90))

function isAuthorized(req) {
  if (req.headers['x-vercel-cron'] === '1') return true
  if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) return true
  return false
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const tables = [
    { name: 'client_sessions', column: 'started_at' },
    { name: 'client_clip_watch', column: 'created_at' },
    { name: 'client_interactions', column: 'created_at' },
    { name: 'client_page_views', column: 'viewed_at' },
  ]

  const deleted = {}

  try {
    for (const { name, column } of tables) {
      const { error, count } = await supabase.from(name).delete({ count: 'exact' }).lt(column, cutoff)
      if (error) {
        console.error(`[cleanup-analytics] ${name}`, error)
        return res.status(500).json({ error: 'Cleanup failed', table: name })
      }
      deleted[name] = count ?? 0
    }
  } catch (e) {
    console.error('[cleanup-analytics]', e)
    return res.status(500).json({ error: 'Cleanup failed' })
  }

  return res.status(200).json({ ok: true, retentionDays, cutoff, deleted })
}

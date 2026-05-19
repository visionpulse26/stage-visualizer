/**
 * Vercel Serverless: GET /api/admin/scan
 * Aggregates Supabase projects + R2 inventory, referenced keys, orphans, analytics counts.
 * Requires authenticated user. Prefers SUPABASE_SERVICE_ROLE_KEY; falls back to the user's JWT (RLS).
 */

import {
  getBearerToken,
  verifyBearerUser,
  getServiceRoleClient,
  createSessionScopedClient,
  publicR2BaseFromEnv,
  collectReferencedR2KeysFromProject,
} from '../lib/adminApiCommon.js'
import {
  createR2S3Client,
  getR2BucketName,
  listAllObjectsUnderPrefix,
  listTopLevelPrefixes,
} from '../lib/r2Admin.js'

const ANALYTICS_TABLES = [
  'client_page_views',
  'client_sessions',
  'client_clip_watch',
  'client_interactions',
  'presentation_versions',
  'client_feedback_items',
]

async function countAnalyticsForProject(supabase, projectId) {
  const pid = String(projectId)
  let total = 0
  for (const name of ANALYTICS_TABLES) {
    const { count, error } = await supabase
      .from(name)
      .select('*', { count: 'exact', head: true })
      .eq('project_id', pid)
    if (!error && typeof count === 'number') total += count
  }
  return total
}

/** Rows in analytics tables whose project_id is not in the live projects list. */
async function countOrphanAnalyticsByTable(supabase, knownIds) {
  const out = {}
  if (knownIds.length === 0) {
    for (const name of ANALYTICS_TABLES) {
      const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true })
      out[name] = error ? 0 : count ?? 0
    }
    return out
  }
  const inCsv = `(${knownIds.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')})`
  for (const name of ANALYTICS_TABLES) {
    const { count, error } = await supabase
      .from(name)
      .select('*', { count: 'exact', head: true })
      .not('project_id', 'in', inCsv)
    out[name] = error ? 0 : count ?? 0
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const bearer = getBearerToken(req)
  const user = await verifyBearerUser(bearer)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const serviceClient = getServiceRoleClient()
  const sessionClient = createSessionScopedClient(bearer)
  const supabase = serviceClient || sessionClient
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase URL/anon key not configured on the server' })
  }
  const usingServiceRole = Boolean(serviceClient)

  let s3
  let bucket
  try {
    s3 = createR2S3Client()
    bucket = getR2BucketName()
  } catch (e) {
    console.error('[admin-scan] R2', e)
    return res.status(500).json({
      error: 'R2 not configured',
      ...(process.env.NODE_ENV !== 'production' && e.missing ? { missing: e.missing } : {}),
    })
  }

  const publicBase = publicR2BaseFromEnv()

  let projectRows = []
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, deleted_at, stage_url, media_playlist, scene_config, is_client_locked')
      .order('created_at', { ascending: false })
    if (error) throw error
    projectRows = data || []
  } catch (e) {
    console.error('[admin-scan] projects', e)
    return res.status(500).json({ error: 'Failed to load projects' })
  }

  const allObjects = new Map()
  try {
    const prefixes = await listTopLevelPrefixes(s3, bucket)
    for (const prefix of prefixes) {
      const objs = await listAllObjectsUnderPrefix(s3, bucket, prefix)
      for (const o of objs) {
        allObjects.set(o.key, { size: o.size, lastModified: o.lastModified })
      }
    }
  } catch (e) {
    console.error('[admin-scan] list R2', e)
    return res.status(500).json({ error: 'Failed to scan R2 bucket' })
  }

  const globalReferenced = new Set()
  for (const p of projectRows) {
    for (const k of collectReferencedR2KeysFromProject(p, publicBase)) {
      globalReferenced.add(k)
    }
  }

  const orphaned_keys = []
  let total_r2_bytes = 0
  for (const [key, meta] of allObjects) {
    total_r2_bytes += meta.size || 0
    if (!globalReferenced.has(key)) {
      orphaned_keys.push({ key, size: meta.size || 0 })
    }
  }
  orphaned_keys.sort((a, b) => a.key.localeCompare(b.key))

  const knownIds = projectRows.map((p) => String(p.id))
  let orphan_analytics_by_table = {}
  if (usingServiceRole) {
    try {
      orphan_analytics_by_table = await countOrphanAnalyticsByTable(supabase, knownIds)
    } catch (e) {
      console.error('[admin-scan] orphan analytics', e)
      orphan_analytics_by_table = {}
    }
  }

  const projects = []
  for (const p of projectRows) {
    const pid = String(p.id)
    const prefix = `${pid}/`
    const r2_files = []
    let r2_size_bytes = 0
    for (const [key, meta] of allObjects) {
      if (key.startsWith(prefix)) {
        r2_files.push({ key, size: meta.size || 0, lastModified: meta.lastModified })
        r2_size_bytes += meta.size || 0
      }
    }
    r2_files.sort((a, b) => a.key.localeCompare(b.key))
    const has_orphan_r2 = r2_files.some(({ key: k }) => !globalReferenced.has(k))
    const db_analytics_rows = await countAnalyticsForProject(supabase, pid)
    projects.push({
      id: pid,
      name: p.name,
      deleted_at: p.deleted_at ?? null,
      is_client_locked: Boolean(p.is_client_locked),
      stage_url: p.stage_url ?? null,
      media_playlist: p.media_playlist ?? [],
      scene_config: p.scene_config ?? null,
      r2_files,
      r2_size_bytes,
      db_analytics_rows,
      has_orphan_r2,
    })
  }

  const activeCount = projects.filter((x) => !x.deleted_at).length
  const softDeletedCount = projects.filter((x) => x.deleted_at).length
  const withOrphanFiles = projects.filter((x) => x.has_orphan_r2).length

  return res.status(200).json({
    projects,
    orphaned_keys,
    total_r2_bytes,
    total_r2_files: allObjects.size,
    orphan_analytics_by_table,
    summary: {
      active_projects: activeCount,
      soft_deleted_projects: softDeletedCount,
      projects_with_orphan_r2: withOrphanFiles,
    },
    scan_access: usingServiceRole ? 'service_role' : 'user_session',
    ...(usingServiceRole
      ? {}
      : {
          notice:
            'Chưa có SUPABASE_SERVICE_ROLE_KEY trên server: scan dùng session của bạn (RLS). Orphan analytics có thể trống; project soft-deleted có thể không hiện. Thêm service role vào .env.local hoặc Vercel → Project → Settings → Environment Variables (Development).',
        }),
  })
}

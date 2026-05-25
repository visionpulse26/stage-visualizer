/**
 * Vercel Serverless: POST /api/admin/project-mutate
 * Destructive / restore actions for Admin Data panel (service role after JWT check).
 *
 * Body:
 *  - { action: 'delete_files_only', projectId: string }
 *  - { action: 'soft_delete', projectId: string }
 *  - { action: 'restore', projectId: string }
 *  - { action: 'hard_delete_all', projectId: string }
 *  - { action: 'delete_files_only_bulk', projectIds: string[] }
 */

import { getBearerToken, verifyBearerUser, getServiceRoleClient, publicR2BaseFromEnv } from '../lib/adminApiCommon.js'
import { createR2S3Client, getR2BucketName, listAllObjectsUnderPrefix, deleteObjectKeys } from '../lib/r2Admin.js'
import { filterDeletableR2Keys } from '../lib/r2ReferenceProtection.js'

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

function isValidProjectId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/') && !id.includes('..')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await verifyBearerUser(getBearerToken(req))
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getServiceRoleClient()
  if (!supabase) {
    return res.status(503).json({
      error:
        'Thiếu SUPABASE_SERVICE_ROLE_KEY trên server. Thêm vào .env.local (cùng thư mục repo) hoặc Vercel Dashboard → Project → Settings → Environment Variables, rồi chạy lại vercel dev. Các thao tác xóa/restore project cần quyền service role.',
    })
  }

  let s3
  let bucket
  try {
    s3 = createR2S3Client()
    bucket = getR2BucketName()
  } catch (e) {
    console.error('[admin-project-mutate] R2', e)
    return res.status(500).json({
      error: 'R2 not configured',
      ...(process.env.NODE_ENV !== 'production' && e.missing ? { missing: e.missing } : {}),
    })
  }

  const body = req.body || {}
  const action = body.action

  async function loadProjectReferenceRows() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, stage_url, media_playlist, scene_config')
    if (error) throw error
    return data || []
  }

  async function deleteR2Prefix(projectId, excludingProjectIds = [projectId], projectRows = null) {
    const prefix = `${projectId}/`
    const objs = await listAllObjectsUnderPrefix(s3, bucket, prefix)
    const keys = objs.map((o) => o.key)
    if (keys.length === 0) return { deleted: [], failed: [], skippedReferenced: [] }

    const refs = projectRows || await loadProjectReferenceRows()
    const { deletable, skippedReferenced } = filterDeletableR2Keys({
      keys,
      projectRows: refs,
      excludingProjectIds,
      publicBase: publicR2BaseFromEnv(),
    })
    const result = deletable.length > 0
      ? await deleteObjectKeys(s3, bucket, deletable)
      : { deleted: [], failed: [] }
    return { ...result, skippedReferenced }
  }

  if (action === 'soft_delete') {
    const projectId = body.projectId
    if (!isValidProjectId(projectId)) return res.status(400).json({ error: 'Invalid projectId' })
    const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', projectId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (action === 'restore') {
    const projectId = body.projectId
    if (!isValidProjectId(projectId)) return res.status(400).json({ error: 'Invalid projectId' })
    const { error } = await supabase.from('projects').update({ deleted_at: null }).eq('id', projectId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (action === 'delete_files_only') {
    const projectId = body.projectId
    if (!isValidProjectId(projectId)) return res.status(400).json({ error: 'Invalid projectId' })
    const refs = await loadProjectReferenceRows()
    const r2 = await deleteR2Prefix(projectId, [projectId], refs)
    const { data: row, error: fetchErr } = await supabase.from('projects').select('scene_config').eq('id', projectId).single()
    if (fetchErr) return res.status(500).json({ error: fetchErr.message })
    const nextCfg = { ...(row?.scene_config && typeof row.scene_config === 'object' ? row.scene_config : {}) }
    delete nextCfg.customHdriUrl
    const { error: upErr } = await supabase
      .from('projects')
      .update({
        stage_url: null,
        media_playlist: [],
        scene_config: nextCfg,
      })
      .eq('id', projectId)
    if (upErr) return res.status(500).json({ error: upErr.message })
    return res.status(200).json({ ok: true, r2 })
  }

  if (action === 'delete_files_only_bulk') {
    const projectIds = body.projectIds
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ error: 'projectIds must be a non-empty array' })
    }
    const results = []
    const refs = await loadProjectReferenceRows()
    for (const projectId of projectIds) {
      if (!isValidProjectId(projectId)) {
        results.push({ projectId, ok: false, error: 'Invalid id' })
        continue
      }
      try {
        const r2 = await deleteR2Prefix(projectId, projectIds, refs)
        const { data: row, error: fetchErr } = await supabase.from('projects').select('scene_config').eq('id', projectId).single()
        if (fetchErr) throw fetchErr
        const nextCfg = { ...(row?.scene_config && typeof row.scene_config === 'object' ? row.scene_config : {}) }
        delete nextCfg.customHdriUrl
        const { error: upErr } = await supabase
          .from('projects')
          .update({ stage_url: null, media_playlist: [], scene_config: nextCfg })
          .eq('id', projectId)
        if (upErr) throw upErr
        results.push({ projectId, ok: true, r2 })
      } catch (e) {
        results.push({ projectId, ok: false, error: e.message || String(e) })
      }
    }
    return res.status(200).json({ ok: true, results })
  }

  if (action === 'hard_delete_all') {
    const projectId = body.projectId
    if (!isValidProjectId(projectId)) return res.status(400).json({ error: 'Invalid projectId' })

    const refs = await loadProjectReferenceRows()
    const tables = ['client_page_views', 'client_sessions', 'client_clip_watch', 'client_interactions']
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq('project_id', projectId)
      if (error) console.error(`[admin-project-mutate] delete ${t}`, error)
    }

    const { error: delProjErr } = await supabase.from('projects').delete().eq('id', projectId)
    if (delProjErr) return res.status(500).json({ error: delProjErr.message })

    const r2 = await deleteR2Prefix(projectId, [projectId], refs)
    return res.status(200).json({ ok: true, r2 })
  }

  return res.status(400).json({ error: 'Unknown action' })
}

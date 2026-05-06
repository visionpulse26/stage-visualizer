import { supabase } from './supabaseClient'

// ── Types (JSDoc) ─────────────────────────────────────────────────────────────
/**
 * @typedef {Object} SlideRef
 * @property {string} id
 * @property {string} type  'image' | 'gif' | 'link'
 * @property {string} url
 * @property {string} caption
 * @property {boolean} visibleToClient
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} Slide
 * @property {string} id
 * @property {string} clipId
 * @property {string} title
 * @property {string} subtitle
 * @property {string} directorNote
 * @property {boolean} directorNoteVisible
 * @property {string} defaultCameraPresetId
 * @property {boolean} hiddenFromClient
 * @property {number} durationSeconds
 * @property {SlideRef[]} references
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} CameraPreset
 * @property {string} id
 * @property {string} name
 * @property {{ x: number, y: number, z: number }} position
 * @property {{ x: number, y: number, z: number }} target
 */

/**
 * @typedef {Object} SnapshotJson
 * @property {number} schemaVersion
 * @property {string} projectName
 * @property {Slide[]} slides
 * @property {CameraPreset[]} cameraPresets
 */

/**
 * @typedef {Object} PresentationVersion
 * @property {string} id
 * @property {string} project_id
 * @property {number} version_number
 * @property {string} version_name
 * @property {'draft'|'published'|'archived'} status
 * @property {string} release_notes
 * @property {SnapshotJson} snapshot_json
 * @property {string|null} published_at
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} FeedbackItem
 * @property {string} id
 * @property {string} project_id
 * @property {string|null} presentation_version_id
 * @property {string} slide_id
 * @property {string} clip_id
 * @property {string} reviewer_name
 * @property {string} comment
 * @property {'pending'|'resolved'} status
 * @property {number|null} clip_time_seconds
 * @property {Object|null} camera_snapshot_json
 * @property {Object|null} annotation_json
 * @property {string} admin_note
 * @property {string|null} resolved_at
 * @property {string} created_at
 */

// ── Presentation Version queries ──────────────────────────────────────────────

/** Load the current draft for a project, or null if none. */
export async function loadDraft(projectId) {
  const { data, error } = await supabase
    .from('presentation_versions')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Load the latest published version for a project, or null if none. */
export async function loadPublishedVersion(projectId) {
  const { data, error } = await supabase
    .from('presentation_versions')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw error
  return data
}

/** Load all versions for a project (newest first). */
export async function loadAllVersions(projectId) {
  const { data, error } = await supabase
    .from('presentation_versions')
    .select('id, project_id, version_number, version_name, status, published_at, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Upsert a draft version. Creates one if none exists; replaces snapshot_json
 * if a draft already exists.
 * @param {string} projectId
 * @param {SnapshotJson} snapshotJson
 * @param {string} [versionName]
 * @returns {Promise<PresentationVersion>}
 */
export async function saveDraft(projectId, snapshotJson, versionName = '') {
  const existing = await loadDraft(projectId)

  if (existing) {
    const { data, error } = await supabase
      .from('presentation_versions')
      .update({
        snapshot_json: snapshotJson,
        version_name: versionName || existing.version_name,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('presentation_versions')
    .insert({
      project_id: projectId,
      version_name: versionName,
      status: 'draft',
      snapshot_json: snapshotJson,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Publish: archive existing published version, promote draft to published.
 * Creates a new draft row if no draft exists.
 * @param {string} projectId
 * @param {SnapshotJson} snapshotJson
 * @param {string} versionName
 * @param {string} [releaseNotes]
 * @returns {Promise<PresentationVersion>} The newly published version.
 */
export async function publishVersion(projectId, snapshotJson, versionName, releaseNotes = '') {
  // Archive the current published version if one exists
  await supabase
    .from('presentation_versions')
    .update({ status: 'archived' })
    .eq('project_id', projectId)
    .eq('status', 'published')

  const draft = await loadDraft(projectId)

  if (draft) {
    const { data, error } = await supabase
      .from('presentation_versions')
      .update({
        status: 'published',
        version_name: versionName,
        release_notes: releaseNotes,
        snapshot_json: snapshotJson,
        published_at: new Date().toISOString(),
      })
      .eq('id', draft.id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // No draft — create a published version directly
  const { data, error } = await supabase
    .from('presentation_versions')
    .insert({
      project_id: projectId,
      version_name: versionName,
      release_notes: releaseNotes,
      status: 'published',
      snapshot_json: snapshotJson,
      published_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Feedback queries ──────────────────────────────────────────────────────────

/**
 * Load all feedback items for a project, optionally filtered by slide.
 * @param {string} projectId
 * @param {{ slideId?: string, status?: 'pending'|'resolved' }} [filters]
 */
export async function loadFeedback(projectId, { slideId, status } = {}) {
  let q = supabase
    .from('client_feedback_items')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (slideId) q = q.eq('slide_id', slideId)
  if (status)  q = q.eq('status', status)

  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * Submit feedback from a desktop client reviewer.
 * @param {Omit<FeedbackItem, 'id'|'created_at'|'updated_at'|'resolved_at'|'admin_note'>} item
 */
export async function submitFeedback(item) {
  const { data, error } = await supabase
    .from('client_feedback_items')
    .insert(item)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Resolve or reopen a feedback item.
 * @param {string} itemId
 * @param {'pending'|'resolved'} newStatus
 * @param {string} [resolvedBy]
 */
export async function setFeedbackStatus(itemId, newStatus, resolvedBy = '') {
  const patch = newStatus === 'resolved'
    ? { status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: resolvedBy }
    : { status: 'pending', resolved_at: null, resolved_by: '' }

  const { data, error } = await supabase
    .from('client_feedback_items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single()

  if (error) throw error
  return data
}

/** Save an admin-internal note on a feedback item (not visible to client). */
export async function saveAdminNote(itemId, note) {
  const { data, error } = await supabase
    .from('client_feedback_items')
    .update({ admin_note: note })
    .eq('id', itemId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

/**
 * Build a SnapshotJson from the current editor state.
 * @param {string} projectName
 * @param {Slide[]} slides
 * @param {CameraPreset[]} cameraPresets
 * @returns {SnapshotJson}
 */
export function buildSnapshot(projectName, slides, cameraPresets) {
  return {
    schemaVersion: 1,
    projectName,
    slides: slides.map((s, i) => ({ ...s, sortOrder: i + 1 })),
    cameraPresets,
  }
}

/**
 * Produce a human-readable summary of a snapshot for the publish modal.
 * @param {SnapshotJson} snapshot
 */
export function snapshotSummary(snapshot) {
  const slides = snapshot.slides ?? []
  const visible = slides.filter(s => !s.hiddenFromClient)
  const allRefs = slides.flatMap(s => s.references ?? [])
  const visibleRefs = allRefs.filter(r => r.visibleToClient)
  const totalSeconds = slides.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0)
  const mins = Math.floor(totalSeconds / 60)
  const secs = String(totalSeconds % 60).padStart(2, '0')

  return {
    clipsTotal: slides.length,
    clipsHidden: slides.length - visible.length,
    refsTotal: allRefs.length,
    refsHidden: allRefs.length - visibleRefs.length,
    camerasEnabled: (snapshot.cameraPresets ?? []).length,
    totalRuntime: `${mins}:${secs}`,
  }
}

/**
 * Compute per-slide publish checklist items.
 * Returns { label, ok, warn }[] — matches the Hi-Fi v2 design.
 * @param {Slide} slide
 */
export function slidePublishChecklist(slide) {
  const hidden = slide.hiddenFromClient
  return [
    { label: 'Title set',               ok: !!slide.title?.trim(),           warn: false },
    { label: 'Subtitle set',            ok: !!slide.subtitle?.trim(),         warn: false },
    { label: 'Director note written',   ok: !!slide.directorNote?.trim(),     warn: false },
    { label: 'Default camera set',      ok: !!slide.defaultCameraPresetId,    warn: false },
    { label: 'References added',        ok: (slide.references?.length ?? 0) > 0, warn: false },
    ...(hidden ? [{ label: 'Hidden from client', ok: false, warn: true }] : []),
  ]
}

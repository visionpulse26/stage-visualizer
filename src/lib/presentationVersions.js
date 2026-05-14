import { supabase } from './supabaseClient'

const FEEDBACK_TABLE_CANDIDATES = ['client_feedback_items', 'client_feedback']

function isMissingTableError(error) {
  const msg = String(error?.message ?? '')
  return msg.includes("Could not find the table") || (msg.includes('relation') && msg.includes('does not exist'))
}

async function runFeedbackQuery(queryFactory) {
  let lastError = null
  for (const table of FEEDBACK_TABLE_CANDIDATES) {
    const { data, error } = await queryFactory(table)
    if (!error) return data
    if (isMissingTableError(error)) {
      lastError = error
      continue
    }
    throw error
  }
  throw lastError ?? new Error('No feedback table available in database schema.')
}

export class VersionConflictError extends Error {
  constructor(currentVersion) {
    super('Draft was updated by someone else.')
    this.name = 'VersionConflictError'
    this.currentVersion = currentVersion
  }
}

function normalizeSaveDraftOptions(versionNameOrOptions = '') {
  if (versionNameOrOptions && typeof versionNameOrOptions === 'object') {
    return {
      versionName: versionNameOrOptions.versionName ?? '',
      releaseNotes: versionNameOrOptions.releaseNotes ?? '',
      expectedToken: versionNameOrOptions.expectedToken ?? null,
      createdBy: versionNameOrOptions.createdBy ?? '',
    }
  }
  return { versionName: versionNameOrOptions || '', releaseNotes: '', expectedToken: null, createdBy: '' }
}

function normalizePublishOptions(versionNameOrOptions = '', releaseNotes = '') {
  if (versionNameOrOptions && typeof versionNameOrOptions === 'object') {
    return {
      versionName: versionNameOrOptions.versionName ?? '',
      releaseNotes: versionNameOrOptions.releaseNotes ?? '',
      expectedToken: versionNameOrOptions.expectedToken ?? null,
      publishedBy: versionNameOrOptions.publishedBy ?? '',
      createdBy: versionNameOrOptions.createdBy ?? '',
    }
  }
  return {
    versionName: versionNameOrOptions || '',
    releaseNotes: releaseNotes || '',
    expectedToken: null,
    publishedBy: '',
    createdBy: '',
  }
}

function assertExpectedToken(currentVersion, expectedToken) {
  if (expectedToken && currentVersion?.version_token !== expectedToken) {
    throw new VersionConflictError(currentVersion)
  }
}

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
 * @typedef {Object} Annotation
 * @property {'circle'|'region'} type
 * @property {{ x: number, y: number, width: number, height: number }} bounds  Normalized 0-1
 * @property {{ width: number, height: number }} [viewport]  Pixel size when drawn (debug only)
 */

/**
 * @typedef {Object} DirectorNote
 * @property {string}          id
 * @property {string}          text
 * @property {boolean}         visibleToClient
 * @property {Annotation|null} annotation
 * @property {string}          cameraPresetId
 * @property {number|null}     clipTimeSeconds
 * @property {number}          sortOrder
 * @property {string}          createdAt
 * @property {string}          updatedAt
 */

/**
 * @typedef {Object} Slide
 * @property {string}         id
 * @property {string}         clipId
 * @property {string}         title
 * @property {string}         subtitle
 * @property {string}         directorNote          DEPRECATED — kept for backwards-compat
 * @property {boolean}        directorNoteVisible   DEPRECATED — kept for backwards-compat
 * @property {DirectorNote[]} directorNotes         Replaces directorNote/directorNoteVisible
 * @property {string}         defaultCameraPresetId
 * @property {boolean}        hiddenFromClient
 * @property {number}         durationSeconds
 * @property {string}         thumbnailUrl
 * @property {SlideRef[]}     references
 * @property {number}         sortOrder
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
 * @property {string} version_token
 * @property {string|null} superseded_by
 * @property {string|null} restored_from
 * @property {string} created_by
 * @property {string} published_by
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

/** Load one presentation version by id, including archived and draft rows. */
export async function loadVersionById(id) {
  const { data, error } = await supabase
    .from('presentation_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Load all versions for a project (newest first). */
export async function loadAllVersions(projectId) {
  const { data, error } = await supabase
    .from('presentation_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('version_number', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Upsert a draft version. Creates one if none exists; replaces snapshot_json
 * if a draft already exists.
 * @param {string} projectId
 * @param {SnapshotJson} snapshotJson
 * @param {string|{ versionName?: string, releaseNotes?: string, expectedToken?: string, createdBy?: string }} [versionNameOrOptions]
 * @returns {Promise<PresentationVersion>}
 */
export async function saveDraft(projectId, snapshotJson, versionNameOrOptions = '') {
  const { versionName, releaseNotes, expectedToken, createdBy } = normalizeSaveDraftOptions(versionNameOrOptions)
  const existing = await loadDraft(projectId)

  if (existing) {
    assertExpectedToken(existing, expectedToken)

    const patch = {
      snapshot_json: snapshotJson,
      version_name: versionName || existing.version_name,
      release_notes: releaseNotes || existing.release_notes,
    }
    if (createdBy && !existing.created_by) patch.created_by = createdBy

    const { data, error } = await supabase
      .from('presentation_versions')
      .update(patch)
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
      release_notes: releaseNotes,
      status: 'draft',
      snapshot_json: snapshotJson,
      created_by: createdBy,
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
 * @param {string|{ versionName?: string, releaseNotes?: string, expectedToken?: string, publishedBy?: string, createdBy?: string }} versionNameOrOptions
 * @param {string} [releaseNotes]
 * @returns {Promise<PresentationVersion>} The newly published version.
 */
export async function publishVersion(projectId, snapshotJson, versionNameOrOptions, releaseNotes = '') {
  const opts = normalizePublishOptions(versionNameOrOptions, releaseNotes)
  const draft = await loadDraft(projectId)
  if (draft) assertExpectedToken(draft, opts.expectedToken)

  const published = await loadPublishedVersion(projectId)
  if (published) {
    const { error: archiveError } = await supabase
      .from('presentation_versions')
      .update({ status: 'archived' })
      .eq('id', published.id)

    if (archiveError) throw archiveError
  }

  if (draft) {
    const patch = {
      status: 'published',
      version_name: opts.versionName,
      release_notes: opts.releaseNotes,
      snapshot_json: snapshotJson,
      published_by: opts.publishedBy,
      published_at: new Date().toISOString(),
    }
    if (opts.createdBy && !draft.created_by) patch.created_by = opts.createdBy

    const { data, error } = await supabase
      .from('presentation_versions')
      .update(patch)
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
      version_name: opts.versionName,
      release_notes: opts.releaseNotes,
      status: 'published',
      snapshot_json: snapshotJson,
      published_by: opts.publishedBy,
      created_by: opts.createdBy,
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
/** Delete the current draft row for a project. Published and archived history is untouched. */
export async function discardDraft(projectId) {
  const { error } = await supabase
    .from('presentation_versions')
    .delete()
    .eq('project_id', projectId)
    .eq('status', 'draft')

  if (error) throw error
}

/**
 * Restore any existing version as a new draft. If a draft exists, archive it first
 * so local work is not silently deleted.
 */
export async function restoreVersion(projectId, sourceVersionId, opts = {}) {
  const source = await loadVersionById(sourceVersionId)
  if (!source || source.project_id !== projectId) {
    throw new Error('Source version not found for this project.')
  }

  const existingDraft = await loadDraft(projectId)
  if (existingDraft) {
    const { error: archiveDraftError } = await supabase
      .from('presentation_versions')
      .update({ status: 'archived' })
      .eq('id', existingDraft.id)

    if (archiveDraftError) throw archiveDraftError
  }

  const { data, error } = await supabase
    .from('presentation_versions')
    .insert({
      project_id: projectId,
      version_name: source.version_name ? `${source.version_name} (restored)` : `Restored v${source.version_number}`,
      release_notes: source.release_notes || '',
      status: 'draft',
      snapshot_json: source.snapshot_json,
      restored_from: source.id,
      created_by: opts.createdBy || '',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/** Restore the current published version as a new draft. */
export async function revertDraftToPublished(projectId) {
  const published = await loadPublishedVersion(projectId)
  if (!published) throw new Error('No published version is available to restore.')
  return restoreVersion(projectId, published.id)
}

/** Rename a version and/or edit its release notes. */
export async function renameVersion(id, { versionName, releaseNotes } = {}) {
  const patch = {}
  if (versionName != null) patch.version_name = versionName
  if (releaseNotes != null) patch.release_notes = releaseNotes
  if (!Object.keys(patch).length) return loadVersionById(id)

  const { data, error } = await supabase
    .from('presentation_versions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** Permanently delete an archived version. */
export async function deleteVersion(id) {
  const version = await loadVersionById(id)
  if (!version) return
  if (version.status !== 'archived') {
    throw new Error('Only archived versions can be deleted.')
  }

  const { error } = await supabase
    .from('presentation_versions')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/** Delete archived versions older than a threshold while keeping the newest K archived rows. */
export async function pruneArchivedVersions(projectId, { keepLatest = 10, olderThanDays = 90 } = {}) {
  const { data, error } = await supabase
    .from('presentation_versions')
    .select('id, created_at')
    .eq('project_id', projectId)
    .eq('status', 'archived')
    .order('version_number', { ascending: false })

  if (error) throw error

  const archived = data ?? []
  const keepCount = Math.max(0, Number(keepLatest) || 0)
  const days = Math.max(0, Number(olderThanDays) || 0)
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const deletableIds = archived
    .slice(keepCount)
    .filter(v => new Date(v.created_at).getTime() < cutoff)
    .map(v => v.id)

  if (!deletableIds.length) return []

  const { error: deleteError } = await supabase
    .from('presentation_versions')
    .delete()
    .in('id', deletableIds)

  if (deleteError) throw deleteError
  return deletableIds
}

export async function loadFeedback(projectId, { slideId, status, versionId } = {}) {
  const data = await runFeedbackQuery((table) => {
    let q = supabase
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (slideId) q = q.eq('slide_id', slideId)
    if (status) q = q.eq('status', status)
    if (versionId) q = q.eq('presentation_version_id', versionId)
    return q
  })
  return data ?? []
}

/**
 * Submit feedback from a desktop client reviewer.
 * @param {Omit<FeedbackItem, 'id'|'created_at'|'updated_at'|'resolved_at'|'admin_note'>} item
 */
export async function submitFeedback(item) {
  const data = await runFeedbackQuery((table) =>
    supabase
      .from(table)
      .insert(item)
      .select()
      .single()
  )
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

  const data = await runFeedbackQuery((table) =>
    supabase
      .from(table)
      .update(patch)
      .eq('id', itemId)
      .select()
      .single()
  )
  return data
}

/** Permanently delete a feedback item. */
export async function deleteFeedback(itemId) {
  await runFeedbackQuery((table) =>
    supabase
      .from(table)
      .delete()
      .eq('id', itemId)
  )
}

/**
 * Update client-editable feedback fields.
 * @param {string} itemId
 * @param {{ reviewer_name?: string, comment?: string }} patch
 */
export async function updateFeedback(itemId, patch) {
  const allowedPatch = {}
  if (patch.reviewer_name != null) allowedPatch.reviewer_name = patch.reviewer_name
  if (patch.comment != null) allowedPatch.comment = patch.comment

  const data = await runFeedbackQuery((table) =>
    supabase
      .from(table)
      .update(allowedPatch)
      .eq('id', itemId)
      .select()
      .single()
  )
  return data
}

/** Save an admin-internal note on a feedback item (not visible to client). */
export async function saveAdminNote(itemId, note) {
  const data = await runFeedbackQuery((table) =>
    supabase
      .from(table)
      .update({ admin_note: note })
      .eq('id', itemId)
      .select()
      .single()
  )
  return data
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

/** @param {Slide} slide @returns {DirectorNote[]} */
function migrateDirectorNotes(slide) {
  if (Array.isArray(slide.directorNotes) && slide.directorNotes.length > 0) {
    return slide.directorNotes
  }
  if (slide.directorNote?.trim()) {
    return [{
      id: `legacy-${slide.id}`,
      text: slide.directorNote,
      visibleToClient: !!slide.directorNoteVisible,
      annotation: null,
      cameraPresetId: slide.defaultCameraPresetId ?? '',
      clipTimeSeconds: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]
  }
  return []
}

/**
 * Hydrate a snapshot loaded from DB, migrating schemaVersion 1 → 2 in memory.
 * @param {SnapshotJson} snapshot
 * @returns {SnapshotJson}
 */
export function hydrateSnapshot(snapshot) {
  if (!snapshot) return snapshot
  if ((snapshot.schemaVersion ?? 1) >= 2) return snapshot
  return {
    ...snapshot,
    schemaVersion: 2,
    slides: (snapshot.slides ?? []).map(s => ({
      ...s,
      directorNotes: migrateDirectorNotes(s),
    })),
  }
}

/**
 * Build a SnapshotJson from the current editor state.
 * @param {string} projectName
 * @param {Slide[]} slides
 * @param {CameraPreset[]} cameraPresets
 * @returns {SnapshotJson}
 */
export function buildSnapshot(projectName, slides, cameraPresets) {
  return {
    schemaVersion: 2,
    projectName,
    slides: slides.map((s, i) => {
      const thumbnailUrl = String(s.thumbnailUrl || s.thumbnail_url || '')
      const safeThumbnailUrl = thumbnailUrl.startsWith('blob:') ? '' : thumbnailUrl
      const directorNotes = migrateDirectorNotes(s)
      // Sync legacy fields from first note for deploys that haven't migrated yet
      const firstNote = directorNotes[0]
      return {
        ...s,
        thumbnailUrl: safeThumbnailUrl,
        thumbnail_url: undefined,
        sortOrder: i + 1,
        directorNotes,
        directorNote: firstNote?.text ?? s.directorNote ?? '',
        directorNoteVisible: firstNote?.visibleToClient ?? s.directorNoteVisible ?? false,
      }
    }),
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
  const hasNote = (slide.directorNotes?.length > 0 && slide.directorNotes.some(n => n.text?.trim()))
    || !!slide.directorNote?.trim()
  return [
    { label: 'Title set',               ok: !!slide.title?.trim(),           warn: false },
    { label: 'Subtitle set',            ok: !!slide.subtitle?.trim(),         warn: false },
    { label: 'Director note written',   ok: hasNote,                          warn: false },
    { label: 'Default camera set',      ok: !!slide.defaultCameraPresetId,    warn: false },
    { label: 'References added',        ok: (slide.references?.length ?? 0) > 0, warn: false },
    ...(hidden ? [{ label: 'Hidden from client', ok: false, warn: true }] : []),
  ]
}

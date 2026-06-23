export const MULTI_MAPLED_PLAYBACK_MODE = 'multi-mapled'

export function isMultiMapledClip(clip) {
  return clip?.playbackMode === MULTI_MAPLED_PLAYBACK_MODE && Array.isArray(clip.sources) && clip.sources.length > 0
}

export function getClipSources(clip) {
  if (!isMultiMapledClip(clip)) return []
  return clip.sources
    .filter((source) => source?.targetId && source?.url)
    .map((source) => ({
      targetId: String(source.targetId),
      targetLabel: source.targetLabel || source.label || String(source.targetId),
      url: source.url,
      type: source.type || clip.type || 'video',
      external: source.external ?? clip.external ?? true,
      ...(source.lqip ? { lqip: source.lqip } : {}),
    }))
}

export function getClipPrimaryUrl(clip) {
  return clip?.url || getClipSources(clip)[0]?.url || ''
}

// Effective media type for activation routing. Honours the per-source type so a
// multi-mapled image clip persisted before the clip-level type fix (when it was
// hardcoded to 'video') still routes down the image branch instead of erroring
// out a <video> on a still and blacking out the stage.
export function getClipMediaType(clip) {
  if (clip?.type === 'image') return 'image'
  if (isMultiMapledClip(clip) && getClipSources(clip)[0]?.type === 'image') return 'image'
  return clip?.type || 'video'
}

export function buildMultiMapledClip({
  name,
  index = 1,
  sources = [],
  idFactory = () => `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
}) {
  const normalizedSources = sources
    .filter((source) => source?.targetId && source?.url)
    .map((source) => ({
      targetId: String(source.targetId),
      targetLabel: source.targetLabel || source.label || String(source.targetId),
      url: source.url,
      type: source.type || 'video',
      external: source.external ?? true,
      ...(source.lqip ? { lqip: source.lqip } : {}),
    }))
  const fallbackName = `Multi Mapled Clip ${index}`
  const cleanName = String(name || '').trim() || fallbackName
  // Clip-level type follows the sources so the activation paths route an
  // image-backed multi-mapled clip down the image branch instead of trying to
  // play a still as a <video> (which errors and blacks out the stage).
  const clipType = normalizedSources[0]?.type || 'video'
  return {
    id: idFactory(),
    name: cleanName,
    url: normalizedSources[0]?.url || '',
    type: clipType,
    playbackMode: MULTI_MAPLED_PLAYBACK_MODE,
    sources: normalizedSources,
    external: true,
    thumbnailUrl: '',
    ...(normalizedSources[0]?.lqip ? { lqip: normalizedSources[0].lqip } : {}),
  }
}

// Build a `mediaByTarget` Map for an image-backed multi-mapled clip. Each source
// becomes a `{ imageUrl }` entry keyed by its targetId — Scene's
// useTexturesByTarget already loads these as static textures, so no video
// controller is needed. `resolveUrl(url)` lets the caller swap a remote URL for a
// cached blob (CORS / dedupe); it may be async and defaults to identity.
export async function buildImageMediaByTarget(clip, resolveUrl = (u) => u) {
  const map = new Map()
  for (const source of getClipSources(clip)) {
    let url = source.url
    try { url = await resolveUrl(source.url) } catch { url = source.url }
    map.set(source.targetId, { imageUrl: url })
  }
  return map
}

// Synchronous `mediaByTarget` of LQIP placeholders (tiny inline data URLs stored
// on each source). Shown instantly while buildImageMediaByTarget downloads the
// full-res blobs, then swapped out. Empty when no source carries an `lqip`.
export function buildLqipMediaByTarget(clip) {
  const map = new Map()
  for (const source of getClipSources(clip)) {
    if (source.lqip) map.set(source.targetId, { imageUrl: source.lqip })
  }
  return map
}

export function serializeClipForPlaylist(clip) {
  const base = {
    ...(clip.id ? { id: clip.id } : {}),
    name: clip.name,
    url: getClipPrimaryUrl(clip),
    type: clip.type,
    external: clip.external ?? true,
    ...(clip.thumbnailUrl || clip.thumbnail_url ? { thumbnailUrl: clip.thumbnailUrl || clip.thumbnail_url } : {}),
    ...(clip.lqip ? { lqip: clip.lqip } : {}),
  }

  if (!isMultiMapledClip(clip)) return base

  return {
    ...base,
    playbackMode: MULTI_MAPLED_PLAYBACK_MODE,
    sources: getClipSources(clip),
  }
}

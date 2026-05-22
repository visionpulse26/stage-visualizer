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
    }))
}

export function getClipPrimaryUrl(clip) {
  return clip?.url || getClipSources(clip)[0]?.url || ''
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
    }))
  const fallbackName = `Multi Mapled Clip ${index}`
  const cleanName = String(name || '').trim() || fallbackName
  return {
    id: idFactory(),
    name: cleanName,
    url: normalizedSources[0]?.url || '',
    type: 'video',
    playbackMode: MULTI_MAPLED_PLAYBACK_MODE,
    sources: normalizedSources,
    external: true,
    thumbnailUrl: '',
  }
}

export function serializeClipForPlaylist(clip) {
  const base = {
    ...(clip.id ? { id: clip.id } : {}),
    name: clip.name,
    url: getClipPrimaryUrl(clip),
    type: clip.type,
    external: clip.external ?? true,
    ...(clip.thumbnailUrl || clip.thumbnail_url ? { thumbnailUrl: clip.thumbnailUrl || clip.thumbnail_url } : {}),
  }

  if (!isMultiMapledClip(clip)) return base

  return {
    ...base,
    playbackMode: MULTI_MAPLED_PLAYBACK_MODE,
    sources: getClipSources(clip),
  }
}

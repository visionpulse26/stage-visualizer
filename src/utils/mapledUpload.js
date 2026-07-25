// Grouping + target-matching for multi-mapled clip uploads.
//
// One "visual" (a song / loop) is uploaded as N files — one per LED map. Files
// are grouped by their base filename and each file is routed to a target (LED
// map) by its filename suffix. This is the AUTO half of the hybrid UX; the
// editor always lets the admin correct the assignment before uploading.

const SEPARATOR_RE = /[\s._-]+/

// Token → role aliases (normalized, lowercase). Maps common suffixes and
// Vietnamese stage terms to canonical roles, then matched against the stage's
// actual target ids/labels.
const ROLE_ALIASES = {
  main:   ['main', 'm', 'chinh', 'cong', 'master', 'center-main'],
  side:   ['side', 's', 'canh', 'phu', 'wing', 'wings'],
  left:   ['left', 'l', 'trai', 'canhtrai'],
  right:  ['right', 'r', 'phai', 'canhphai'],
  center: ['center', 'centre', 'c', 'giua', 'trung', 'middle'],
  // Projection-mapping floor surface. Program convention: '_P' (short) or
  // '_MAPPING' (long) — parallel to '_M' / '_MAIN' for the main LED. '_M' is
  // taken by `main`, so mapping's short form is '_P', not '_M'. The group also
  // links whether the target is named 'floor', 'p', or 'mapping'.
  floor:  ['floor', 'p', 'mapping'],
}

function normalizeToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function stripExtension(filename) {
  return String(filename || '').replace(/\.[^.]+$/, '')
}

// Split a filename into { baseName, suffix }. The suffix is the trailing token
// after the last separator; everything before it is the base used for grouping.
//   "Opening_MAIN.mp4"      → { baseName: 'Opening',      suffix: 'MAIN' }
//   "My Song_Final-side.mp4"→ { baseName: 'My Song_Final',suffix: 'side' }
//   "Opening.mp4"           → { baseName: 'Opening',      suffix: '' }
export function parseMapledFilename(filename) {
  const stem = stripExtension(filename)
  const lastSep = stem.search(/[\s._-]+(?=[^\s._-]+$)/)
  if (lastSep < 0) return { baseName: stem, suffix: '' }
  const suffix = stem.slice(lastSep).replace(SEPARATOR_RE, '')
  const baseName = stem.slice(0, lastSep)
  return { baseName: baseName || stem, suffix }
}

function buildTargetTokens(target) {
  const tokens = new Set()
  const add = (t) => { const n = normalizeToken(t); if (n) tokens.add(n) }
  add(target.targetId)
  String(target.targetId || '').split('_').forEach(add)
  String(target.label || '').split(SEPARATOR_RE).forEach(add)
  // Pull in alias group(s) that any of the above tokens belong to
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if ([...tokens].some((t) => t === role || aliases.includes(t))) {
      add(role)
      aliases.forEach(add)
    }
  }
  return tokens
}

// Resolve a filename suffix to one of the stage's targets. Returns the targetId
// or null. Numeric suffixes (1, 2, …) map by target order (1-based).
export function matchSuffixToTarget(suffix, targets = []) {
  const norm = normalizeToken(suffix)
  if (!norm || !targets.length) return null

  // Numeric → by order
  if (/^\d+$/.test(norm)) {
    const idx = parseInt(norm, 10) - 1
    const ordered = [...targets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return ordered[idx]?.targetId ?? null
  }

  for (const target of targets) {
    if (buildTargetTokens(target).has(norm)) return target.targetId
  }
  return null
}

// Group selected files into proposed multi-mapled clips.
// Returns { isMultiMapled, groups }, where each group is:
//   { key, clipName, assignments: [{ file, targetId, targetLabel, auto }],
//     usedTargetIds, missingTargetIds, conflictTargetIds }
export function groupFilesIntoMapledClips(files = [], targets = []) {
  const fileList = Array.from(files || [])
  const targetById = new Map(targets.map((t) => [t.targetId, t]))
  const groupsByKey = new Map()

  for (const file of fileList) {
    const { baseName, suffix } = parseMapledFilename(file.name)
    const key = normalizeToken(baseName) || normalizeToken(file.name)
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, { key, clipName: baseName, files: [] })
    }
    groupsByKey.get(key).files.push({ file, suffix })
  }

  const groups = [...groupsByKey.values()].map((group) => {
    const assignments = []
    const used = new Set()

    // First pass: honour confident suffix matches
    for (const { file, suffix } of group.files) {
      const matched = matchSuffixToTarget(suffix, targets)
      if (matched && !used.has(matched)) {
        used.add(matched)
        assignments.push({ file, targetId: matched, targetLabel: targetById.get(matched)?.label || matched, auto: true })
      } else {
        assignments.push({ file, targetId: null, targetLabel: '', auto: false })
      }
    }

    // Second pass: fill the unassigned files with remaining targets, in order
    const remaining = [...targets]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((t) => !used.has(t.targetId))
    let r = 0
    for (const a of assignments) {
      if (a.targetId) continue
      const t = remaining[r++]
      if (t) {
        a.targetId = t.targetId
        a.targetLabel = t.label || t.targetId
        a.auto = false
        used.add(t.targetId)
      }
    }

    const counts = assignments.reduce((m, a) => {
      if (a.targetId) m.set(a.targetId, (m.get(a.targetId) || 0) + 1)
      return m
    }, new Map())

    return {
      key: group.key,
      clipName: group.clipName,
      assignments,
      usedTargetIds: [...used],
      missingTargetIds: targets.map((t) => t.targetId).filter((id) => !used.has(id)),
      conflictTargetIds: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
    }
  })

  // Multi-mapled only when the stage actually has >1 target AND at least one
  // group bundles more than one file.
  const isMultiMapled = targets.length > 1 && groups.some((g) => g.assignments.length > 1)
  return { isMultiMapled, groups }
}

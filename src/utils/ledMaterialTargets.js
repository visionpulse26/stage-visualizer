export const LED_MASTER_TARGET_ID = 'master'
export const LED_MASTER_TARGET_LABEL = 'Master LED'
export const LED_MASTER_MATERIAL_NAME = 'LED_MASTER_MAT'
export const LED_TRANSPARENT_MATERIAL_NAME = 'LED_TRANSPARENT_MAT'

const INDEXED_TARGET_RE = /^[A-Z]$/
const TARGETED_LED_RE = /(?:^|_)LED_MAPLED_([A-Z0-9]+)(?:_MAT|_MESH|_PANEL|_SURFACE)?(?:_|$)/
const LOOSE_TARGETED_LED_RE = /(?:^|_)MAPLED_([A-Z0-9]+)(?:_MAT|_MESH|_PANEL|_SURFACE)?(?:_|$)/
// Loose "is this LED-ish?" heuristic — the word LED appears as a token. Used only
// for DISCOVERY (the role-assignment selector), never for routing-by-convention.
// Catches real-world C4D names like "LED Main" / "Led Side" that follow no
// naming convention and would otherwise not register as LED at all.
const LEDISH_RE = /(?:^|_)LED(?:_|$)/

export function normalizeLedTargetToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function formatLedTargetLabel(targetId) {
  const normalized = normalizeLedTargetToken(targetId)
  if (!normalized || normalized === LED_MASTER_TARGET_ID) return LED_MASTER_TARGET_LABEL
  if (INDEXED_TARGET_RE.test(normalized.toUpperCase())) return `Mapled ${normalized.toUpperCase()}`
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseTargetedLedName(name) {
  const normalized = normalizeName(name)
  const match = normalized.match(TARGETED_LED_RE) || normalized.match(LOOSE_TARGETED_LED_RE)
  if (!match?.[1]) return null

  const targetId = normalizeLedTargetToken(match[1])
  if (!targetId) return null

  return {
    surfaceType: 'solid',
    targetId,
    targetLabel: formatLedTargetLabel(targetId),
    sourceName: name,
    isTargeted: true,
  }
}

function parseLegacyLedName(name) {
  const normalized = normalizeName(name)
  if (normalized === LED_MASTER_MATERIAL_NAME || normalized.startsWith(`${LED_MASTER_MATERIAL_NAME}_`)) {
    return {
      surfaceType: 'solid',
      targetId: LED_MASTER_TARGET_ID,
      targetLabel: LED_MASTER_TARGET_LABEL,
      sourceName: name,
      isTargeted: false,
    }
  }
  if (
    normalized === LED_TRANSPARENT_MATERIAL_NAME ||
    normalized.startsWith(`${LED_TRANSPARENT_MATERIAL_NAME}_`) ||
    normalized === 'TRANSPA' ||
    normalized.startsWith('TRANSPA_')
  ) {
    return {
      surfaceType: 'solid',
      targetId: LED_MASTER_TARGET_ID,
      targetLabel: LED_MASTER_TARGET_LABEL,
      sourceName: name,
      isTargeted: false,
    }
  }
  if (normalized.startsWith('LED_GRID_')) {
    return {
      surfaceType: 'transparent-grid',
      targetId: LED_MASTER_TARGET_ID,
      targetLabel: LED_MASTER_TARGET_LABEL,
      sourceName: name,
      isTargeted: false,
    }
  }
  return null
}

function findLedSurface(names, sourceKind) {
  for (const name of names) {
    const targeted = parseTargetedLedName(name)
    if (targeted) return { ...targeted, sourceKind }
  }
  for (const name of names) {
    const legacy = parseLegacyLedName(name)
    if (legacy) return { ...legacy, sourceKind }
  }
  return null
}

export function detectLedSurfaceTarget(materialNames = [], meshName = '') {
  const materialSurface = findLedSurface(Array.isArray(materialNames) ? materialNames : [materialNames], 'material')
  if (materialSurface) return materialSurface
  return findLedSurface([meshName], 'mesh')
}

export function upsertLedTarget(targets, surface) {
  if (!surface?.targetId) return targets
  const existing = targets.find((target) => target.id === surface.targetId)
  if (existing) {
    if (!existing.sourceNames.includes(surface.sourceName)) existing.sourceNames.push(surface.sourceName)
    existing.surfaceTypes = Array.from(new Set([...existing.surfaceTypes, surface.surfaceType]))
    existing.isTargeted = existing.isTargeted || surface.isTargeted
    return targets
  }
  targets.push({
    id: surface.targetId,
    label: surface.targetLabel,
    sourceNames: surface.sourceName ? [surface.sourceName] : [],
    surfaceTypes: surface.surfaceType ? [surface.surfaceType] : [],
    isTargeted: !!surface.isTargeted,
  })
  return targets
}

function findLedishName(names) {
  for (const name of names) {
    if (LEDISH_RE.test(normalizeName(name))) return name
  }
  return null
}

// ── Surface key — the single primitive shared by discovery + render routing ──
// Returns a stable `key` that identifies which physical LED map a mesh belongs to.
//   • convention (LED_MAPLED_<TOKEN>) → key = targetId (e.g. 'main', 'side')
//   • legacy (LED_MASTER_MAT / grid / transparent) → key = 'master' (collapses,
//     preserving single-map back-compat)
//   • heuristic (name merely contains "LED", no convention) → key derived from
//     the distinguishing material/mesh name so separate panels stay separable
// Returns null when the mesh is not an LED surface at all.
export function getLedSurfaceKey(materialNames = [], meshName = '') {
  const mats = (Array.isArray(materialNames) ? materialNames : [materialNames]).filter(Boolean)
  const detected = detectLedSurfaceTarget(mats, meshName)
  if (detected) {
    return {
      key: detected.targetId,
      label: detected.targetLabel,
      surfaceType: detected.surfaceType,
      isTargeted: !!detected.isTargeted,
      matchKind: detected.isTargeted ? 'convention' : 'legacy',
      sourceName: detected.sourceName,
    }
  }

  const ledish = findLedishName([...mats, meshName].filter(Boolean))
  if (ledish) {
    const key = normalizeLedTargetToken(ledish) || LED_MASTER_TARGET_ID
    return {
      key,
      label: formatLedTargetLabel(key),
      surfaceType: 'solid',
      isTargeted: false,
      matchKind: 'heuristic',
      sourceName: ledish,
    }
  }
  return null
}

// ── Discovery — feed for the role-assignment selector in the editor/admin ────
// Given mesh scan metadata ([{ name, materialNames }]), returns the distinct LED
// candidate surfaces an admin can map to roles. Even when the GLB follows no
// naming convention, each physically-distinct LED panel surfaces here.
export function discoverLedSurfaces(meshScan = []) {
  const byKey = new Map()
  for (const meta of Array.isArray(meshScan) ? meshScan : []) {
    const materialNames = Array.isArray(meta?.materialNames) ? meta.materialNames : []
    const meshName = meta?.name || ''
    const surface = getLedSurfaceKey(materialNames, meshName)
    if (!surface) continue

    const existing = byKey.get(surface.key)
    if (existing) {
      materialNames.forEach((m) => { if (m && !existing.materialNames.includes(m)) existing.materialNames.push(m) })
      if (meshName && !existing.meshNames.includes(meshName)) existing.meshNames.push(meshName)
      existing.meshCount += 1
      existing.isTargeted = existing.isTargeted || surface.isTargeted
      if (!existing.surfaceTypes.includes(surface.surfaceType)) existing.surfaceTypes.push(surface.surfaceType)
      continue
    }
    byKey.set(surface.key, {
      key: surface.key,
      label: surface.label,
      matchKind: surface.matchKind,
      isTargeted: surface.isTargeted,
      surfaceTypes: [surface.surfaceType],
      materialNames: materialNames.filter(Boolean),
      meshNames: meshName ? [meshName] : [],
      meshCount: 1,
    })
  }

  // Convention/legacy first, then heuristic; stable by key within each group.
  const rank = { convention: 0, legacy: 1, heuristic: 2 }
  return [...byKey.values()].sort((a, b) => {
    const r = (rank[a.matchKind] ?? 9) - (rank[b.matchKind] ?? 9)
    return r !== 0 ? r : a.key.localeCompare(b.key)
  })
}

// ── Routing resolver — used by render (Phase B) AND the targets hook ─────────
// Maps a mesh to its logical targetId, honouring an admin `ledTargetMap`
// (surfaceKey → { targetId, label, order }). Falls back to the surface key
// itself so convention-named GLBs route correctly with zero config.
export function resolveLedTargetId(materialNames, meshName, ledTargetMap = {}) {
  const surface = getLedSurfaceKey(materialNames, meshName)
  if (!surface) return null
  const override = ledTargetMap?.[surface.key]
  return {
    ...surface,
    targetId: override?.targetId || surface.key,
    label: override?.label || surface.label,
    order: override?.order,
  }
}

// ── Resolve the canonical target list for editor upload + playback grouping ──
// Collapses discovered surfaces through `ledTargetMap` into the distinct logical
// targets (roles) the rest of the feature uploads against and plays back.
export function resolveLedTargets(meshScan = [], ledTargetMap = {}) {
  const surfaces = discoverLedSurfaces(meshScan)
  const byTarget = new Map()
  surfaces.forEach((surface, index) => {
    const override = ledTargetMap?.[surface.key]
    const targetId = override?.targetId || surface.key
    const label = override?.label || surface.label
    const order = Number.isFinite(override?.order) ? override.order : index
    const existing = byTarget.get(targetId)
    if (existing) {
      existing.surfaceKeys.push(surface.key)
      existing.isTargeted = existing.isTargeted || surface.isTargeted
      existing.order = Math.min(existing.order, order)
      return
    }
    byTarget.set(targetId, {
      targetId,
      label,
      order,
      isTargeted: surface.isTargeted,
      surfaceKeys: [surface.key],
    })
  })
  return [...byTarget.values()].sort((a, b) => a.order - b.order || a.targetId.localeCompare(b.targetId))
}

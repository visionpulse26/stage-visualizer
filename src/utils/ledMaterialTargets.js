export const LED_MASTER_TARGET_ID = 'master'
export const LED_MASTER_TARGET_LABEL = 'Master LED'
export const LED_MASTER_MATERIAL_NAME = 'LED_MASTER_MAT'
export const LED_TRANSPARENT_MATERIAL_NAME = 'LED_TRANSPARENT_MAT'

const INDEXED_TARGET_RE = /^[A-Z]$/
const TARGETED_LED_RE = /(?:^|_)LED_MAPLED_([A-Z0-9]+)(?:_MAT|_MESH|_PANEL|_SURFACE)?(?:_|$)/
const LOOSE_TARGETED_LED_RE = /(?:^|_)MAPLED_([A-Z0-9]+)(?:_MAT|_MESH|_PANEL|_SURFACE)?(?:_|$)/

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
  if (normalized === LED_MASTER_MATERIAL_NAME) {
    return {
      surfaceType: 'solid',
      targetId: LED_MASTER_TARGET_ID,
      targetLabel: LED_MASTER_TARGET_LABEL,
      sourceName: name,
      isTargeted: false,
    }
  }
  if (normalized === LED_TRANSPARENT_MATERIAL_NAME || normalized.startsWith('LED_GRID_')) {
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

// Stage surface material presets — resolved from the authored material name.
//
// Extracted from Scene.jsx so the matching is unit-testable. Behaviour is
// unchanged except for the pattern-normalization fix documented below.
//
// Matching is token-based: both the material name AND the pattern are flattened
// to space-separated alphanumeric words before a substring compare. Normalizing
// BOTH sides matters — patterns are authored with underscores (`STAGE_FLOOR`)
// while the incoming name is flattened to spaces (`MAT STAGE FLOOR BLACK`), so
// comparing a raw pattern against normalized tokens could never match. That made
// nine patterns dead — STAGE_FLOOR, FLOOR_BLACK, BLACK_FLOOR, PANEL_BLACK,
// TRIM_BLACK, TRUSS_RUST, RUST_TRUSS, TRUSS_STEEL, TRUSS_IRON — silently sending
// `MAT_STAGE_FLOOR_BLACK` to the grey default instead of the black floor preset.

export const DEFAULT_STAGE_MATERIAL = {
  color: '#5a5d62',
  roughness: 0.72,
  metalness: 0.08,
  envMapIntensity: 0.75,
}

export const STAGE_MATERIAL_PRESETS = [
  {
    id: 'truss-weathered',
    patterns: ['TRUSS_RUST', 'RUST_TRUSS', 'TRUSS_STEEL', 'TRUSS_IRON', 'OXIDE', 'CORRODED'],
    settings: {
      color: '#74675d',
      roughness: 0.74,
      metalness: 0.52,
      envMapIntensity: 0.95,
      clearcoat: 0.08,
      clearcoatRoughness: 0.9,
    },
  },
  {
    id: 'truss-aluminum',
    patterns: ['TRUSS', 'ALUMINUM', 'ALUMINIUM', 'ALU', 'RIGGING', 'PIPE', 'TUBE'],
    settings: {
      color: '#949aa1',
      roughness: 0.34,
      metalness: 0.96,
      envMapIntensity: 1.4,
      clearcoat: 0.22,
      clearcoatRoughness: 0.42,
    },
  },
  {
    id: 'stage-floor-black',
    patterns: ['STAGE_FLOOR', 'FLOOR_BLACK', 'BLACK_FLOOR', 'RUNWAY', 'CATWALK', 'DECK', 'STEP', 'STAIR', 'PLATFORM'],
    settings: {
      color: '#0b0c0f',
      roughness: 0.96,
      metalness: 0.02,
      envMapIntensity: 0.08,
      specularIntensity: 0.32,
      clearcoat: 0,
    },
  },
  {
    id: 'mask-panel-black',
    patterns: ['FORMAT', 'FASCIA', 'MASK', 'CLADDING', 'COVER', 'CASING', 'SHROUD', 'SKIRT', 'PANEL_BLACK', 'TRIM_BLACK'],
    settings: {
      color: '#151619',
      roughness: 0.8,
      metalness: 0.03,
      envMapIntensity: 0.4,
      clearcoat: 0.02,
      clearcoatRoughness: 0.95,
    },
  },
  {
    id: 'frame-black',
    patterns: ['FRAME', 'BRACKET', 'STRUCT', 'SUPPORT', 'BEAM', 'BAR', 'RAIL'],
    settings: {
      color: '#2d3136',
      roughness: 0.58,
      metalness: 0.78,
      envMapIntensity: 1.0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.7,
    },
  },
]

export function normalizeMaterialTokens(...names) {
  return names
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
}

// Patterns are static, so normalize them once at module load rather than per mesh.
const PRESET_MATCHERS = STAGE_MATERIAL_PRESETS.map((preset) => ({
  preset,
  patterns: preset.patterns.map((pattern) => normalizeMaterialTokens(pattern)),
}))

export function resolveStageMaterialPreset(...names) {
  const tokens = normalizeMaterialTokens(...names)
  if (!tokens) return { id: 'default', settings: DEFAULT_STAGE_MATERIAL }

  for (const { preset, patterns } of PRESET_MATCHERS) {
    if (patterns.some((pattern) => tokens.includes(pattern))) {
      return preset
    }
  }

  return { id: 'default', settings: DEFAULT_STAGE_MATERIAL }
}

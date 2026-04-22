import { useEffect, useRef, useMemo, useState } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const LED_MATERIAL_NAME = 'LED_MASTER_MAT'
const TRANSPARENT_LED_MATERIAL_NAME = 'LED_TRANSPARENT_MAT'
const EMISSIVE_TARGET    = 1.5
const EMISSIVE_FADE_SECS = 0.5

const DEFAULT_TRANSPARENT_LED = {
  enabled: true,
  gridDensity: 36,
  gridDensityX: 36,
  gridDensityY: 36,
  barThickness: 0.08,
  barThicknessX: 0.08,
  barThicknessY: 0.08,
  glow: 1.4,
  opacity: 0.95,
}

const DEFAULT_STAGE_MATERIAL = {
  color: '#5a5d62',
  roughness: 0.72,
  metalness: 0.08,
  envMapIntensity: 0.75,
}

const STAGE_MATERIAL_PRESETS = [
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

const transparentLedVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const transparentLedFragmentShader = `
  uniform sampler2D uMap;
  uniform bool uHasMap;
  uniform vec2 uGridDensity;
  uniform vec2 uBarThickness;
  uniform float uGlow;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 gridUv = vUv * max(uGridDensity, vec2(1.0));
    vec2 cell = fract(gridUv);
    float distX = min(cell.x, 1.0 - cell.x);
    float distY = min(cell.y, 1.0 - cell.y);
    float aaX = max(fwidth(distX), 0.001);
    float aaY = max(fwidth(distY), 0.001);
    float verticalMask = 1.0 - smoothstep(uBarThickness.x, uBarThickness.x + aaX, distX);
    float horizontalMask = 1.0 - smoothstep(uBarThickness.y, uBarThickness.y + aaY, distY);
    float lineMask = max(verticalMask, horizontalMask);

    vec4 texel = uHasMap ? texture2D(uMap, vUv) : vec4(0.08, 0.08, 0.08, 1.0);
    float alpha = lineMask * texel.a * uOpacity;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(texel.rgb * uGlow, alpha);
  }
`

function getLedSurfaceType(...names) {
  const normalized = names.filter(Boolean)
  if (normalized.some(name => name === LED_MATERIAL_NAME)) return 'solid'
  if (normalized.some(name => name === TRANSPARENT_LED_MATERIAL_NAME)) return 'transparent-grid'
  if (normalized.some(name => name.startsWith('LED_GRID_'))) return 'transparent-grid'
  return null
}

function createTransparentLedMaterial(texture, transparentLedConfig = DEFAULT_TRANSPARENT_LED) {
  const cfg = { ...DEFAULT_TRANSPARENT_LED, ...(transparentLedConfig || {}) }
  const densityX = Math.max(1, Number(cfg.gridDensityX ?? cfg.gridDensity) || DEFAULT_TRANSPARENT_LED.gridDensityX)
  const densityY = Math.max(1, Number(cfg.gridDensityY ?? cfg.gridDensity) || DEFAULT_TRANSPARENT_LED.gridDensityY)
  const thicknessX = Math.max(0.01, Math.min(0.24, Number(cfg.barThicknessX ?? cfg.barThickness) || DEFAULT_TRANSPARENT_LED.barThicknessX))
  const thicknessY = Math.max(0.01, Math.min(0.24, Number(cfg.barThicknessY ?? cfg.barThickness) || DEFAULT_TRANSPARENT_LED.barThicknessY))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture || new THREE.Texture() },
      uHasMap: { value: !!texture },
      uGridDensity: { value: new THREE.Vector2(densityX, densityY) },
      uBarThickness: { value: new THREE.Vector2(thicknessX, thicknessY) },
      uGlow: { value: Math.max(0, Number(cfg.glow) || DEFAULT_TRANSPARENT_LED.glow) },
      uOpacity: { value: Math.max(0, Math.min(1, Number(cfg.opacity) || DEFAULT_TRANSPARENT_LED.opacity)) },
    },
    vertexShader: transparentLedVertexShader,
    fragmentShader: transparentLedFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  material.name = TRANSPARENT_LED_MATERIAL_NAME
  return material
}

function normalizeMaterialTokens(...names) {
  return names
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
}

function resolveStageMaterialPreset(...names) {
  const tokens = normalizeMaterialTokens(...names)
  if (!tokens) return { id: 'default', settings: DEFAULT_STAGE_MATERIAL }

  for (const preset of STAGE_MATERIAL_PRESETS) {
    if (preset.patterns.some(pattern => tokens.includes(pattern))) {
      return preset
    }
  }

  return { id: 'default', settings: DEFAULT_STAGE_MATERIAL }
}

function applyStageMaterialPreset(material, presetSettings, envIntensity) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return

  const settings = { ...DEFAULT_STAGE_MATERIAL, ...(presetSettings || {}) }
  const baseEnv = Math.max(0, envIntensity ?? 1)

  material.color?.set?.(settings.color)
  material.roughness = settings.roughness
  material.metalness = settings.metalness
  material.envMapIntensity = settings.envMapIntensity * baseEnv
  material.userData.envIntensityScale = settings.envMapIntensity

  if ('clearcoat' in material) material.clearcoat = settings.clearcoat ?? 0
  if ('clearcoatRoughness' in material) material.clearcoatRoughness = settings.clearcoatRoughness ?? 0
  if ('sheen' in material) material.sheen = settings.sheen ?? 0
  if ('sheenRoughness' in material) material.sheenRoughness = settings.sheenRoughness ?? 1
  if ('specularIntensity' in material) material.specularIntensity = settings.specularIntensity ?? 1

  material.needsUpdate = true
}

function getBoxOverlapRatio(a, b) {
  const overlapMin = new THREE.Vector3(
    Math.max(a.min.x, b.min.x),
    Math.max(a.min.y, b.min.y),
    Math.max(a.min.z, b.min.z)
  )
  const overlapMax = new THREE.Vector3(
    Math.min(a.max.x, b.max.x),
    Math.min(a.max.y, b.max.y),
    Math.min(a.max.z, b.max.z)
  )
  const size = new THREE.Vector3().subVectors(overlapMax, overlapMin)
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return 0
  const overlapVolume = size.x * size.y * size.z
  const aSize = new THREE.Vector3()
  const bSize = new THREE.Vector3()
  a.getSize(aSize)
  b.getSize(bSize)
  const aVolume = Math.max(aSize.x * aSize.y * aSize.z, 1e-6)
  const bVolume = Math.max(bSize.x * bSize.y * bSize.z, 1e-6)
  return overlapVolume / Math.min(aVolume, bVolume)
}

function getDuplicateStagePolicy(entry, ledEntries) {
  if (!entry || entry.ledSurfaceType || ledEntries.length === 0) return null

  let maxOverlap = 0
  let sharesOrigin = false

  for (const ledEntry of ledEntries) {
    maxOverlap = Math.max(maxOverlap, getBoxOverlapRatio(entry.box, ledEntry.box))
    if (entry.worldPosition.distanceToSquared(ledEntry.worldPosition) < 0.0001) {
      sharesOrigin = true
    }
  }

  if (!sharesOrigin || maxOverlap < 0.9) return null

  const isNullMesh = /\bNULL\b/.test(entry.tokens)
  const isBackMesh = /\bBACK\b/.test(entry.tokens)
  const isUnnamedDarkShell = entry.preset.id === 'default'

  if (isNullMesh && maxOverlap > 0.985) return 'hide'
  if ((isBackMesh || isUnnamedDarkShell) && maxOverlap > 0.92) return 'non-occluding'
  return null
}

function createStableStageMaterial(sourceMaterial, presetSettings, envIntensity, presetId = 'default') {
  const material = sourceMaterial?.clone?.() || new THREE.MeshStandardMaterial()
  const settings = { ...DEFAULT_STAGE_MATERIAL, ...(presetSettings || {}) }
  const baseEnv = Math.max(0, envIntensity ?? 1)

  material.name = sourceMaterial?.name || 'STAGE_MAT'

  // Force stable opaque PBR defaults for stage surfaces imported from DCC tools.
  material.transparent = false
  material.opacity = 1
  material.alphaTest = 0
  if ('transmission' in material) material.transmission = 0
  if ('thickness' in material) material.thickness = 0
  if ('ior' in material) material.ior = 1.45
  material.side = presetId === 'stage-floor-black' ? THREE.FrontSide : (sourceMaterial?.side ?? THREE.FrontSide)
  material.depthWrite = true
  material.depthTest = true
  material.toneMapped = true
  material.polygonOffset = true
  material.polygonOffsetFactor = 1
  material.polygonOffsetUnits = 1
  material.flatShading = false

  material.color.set(sourceMaterial?.map ? '#ffffff' : settings.color)
  material.roughness = sourceMaterial?.roughnessMap ? 1 : settings.roughness
  material.metalness = sourceMaterial?.metalnessMap ? 1 : settings.metalness
  material.envMapIntensity = settings.envMapIntensity * baseEnv
  material.userData.envIntensityScale = settings.envMapIntensity
  if ('clearcoat' in material) material.clearcoat = settings.clearcoat ?? 0
  if ('clearcoatRoughness' in material) material.clearcoatRoughness = settings.clearcoatRoughness ?? 0
  if ('sheen' in material) material.sheen = 0
  if ('sheenRoughness' in material) material.sheenRoughness = 1
  if ('specularIntensity' in material) material.specularIntensity = settings.specularIntensity ?? 1
  if ('reflectivity' in material) material.reflectivity = 0.5
  material.emissive?.set?.('#000000')

  material.needsUpdate = true
  return material
}

// ── LED screen light sources ──────────────────────────────────────────────────
function LedLights({ positions, color, active }) {
  if (!active || positions.length === 0) return null
  return (
    <>
      {positions.map((pos, i) => (
        <pointLight
          key={i}
          position={pos}
          intensity={8}
          distance={18}
          decay={2}
          color={color}
        />
      ))}
    </>
  )
}

function ModelContent({ gltf, videoElement, activeImageUrl, onLedMaterialStatus, protectLed, sunIntensity, envIntensity, transparentLedConfig, onImageTextureLoaded, onModelMetrics }) {
  const videoTextureRef = useRef(null)
  const imageTextureRef = useRef(null)
  const prevLedMaterialsRef = useRef([])
  const onImageLoadedRef = useRef(onImageTextureLoaded)
  onImageLoadedRef.current = onImageTextureLoaded

  const [ledPositions, setLedPositions] = useState([])
  const [ledColor,     setLedColor]     = useState('#ffffff')

  const ledMaterialsRef    = useRef([])
  const emissiveCurrentRef = useRef(0)

  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf])

  // ── Video texture with disposal ─────────────────────────────────────────────
  const videoTexture = useMemo(() => {
    if (videoTextureRef.current) {
      videoTextureRef.current.dispose()
      videoTextureRef.current = null
    }
    if (!videoElement) return null
    try {
      const t = new THREE.VideoTexture(videoElement)
      t.minFilter   = THREE.LinearFilter
      t.magFilter   = THREE.LinearFilter
      t.colorSpace  = THREE.SRGBColorSpace
      t.flipY       = false
      t.wrapS       = THREE.ClampToEdgeWrapping
      t.wrapT       = THREE.ClampToEdgeWrapping
      videoTextureRef.current = t
      return t
    } catch {
      return null
    }
  }, [videoElement])

  // ── Image texture — single load, blob URL revoked after GPU upload ──────────
  // Replaces THREE.TextureLoader (which made a separate internal XHR visible in
  // the DevTools Network tab) + a second img.src load for color sampling.
  // Now: one Image load → texture + color sample → blob URL revoked immediately.
  const [imageTexture, setImageTexture] = useState(null)

  useEffect(() => {
    // Clear texture when url is removed
    if (!activeImageUrl) {
      if (imageTextureRef.current) {
        imageTextureRef.current.dispose()
        imageTextureRef.current = null
      }
      setImageTexture(null)
      return
    }

    let cancelled = false
    let revoked   = false

    const safeRevoke = () => {
      if (!revoked) {
        try { URL.revokeObjectURL(activeImageUrl) } catch (_) {}
        revoked = true
      }
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (cancelled) { safeRevoke(); return }

      // 1. Dispose previous texture
      if (imageTextureRef.current) {
        imageTextureRef.current.dispose()
        imageTextureRef.current = null
      }

      // 2. Build Three.js texture directly from the loaded HTMLImageElement.
      //    new THREE.Texture(img) + needsUpdate uploads pixels to the GPU without
      //    making an additional XHR — the blob URL is only consumed once here.
      try {
        const t = new THREE.Texture(img)
        t.colorSpace  = THREE.SRGBColorSpace
        t.flipY       = false
        t.wrapS       = THREE.ClampToEdgeWrapping
        t.wrapT       = THREE.ClampToEdgeWrapping
        t.needsUpdate = true
        imageTextureRef.current = t
        setImageTexture(t)
        onImageLoadedRef.current?.()
      } catch (_) {}

      // 3. Color sampling — reuse the already-decoded image, no extra network hit
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = 8
        canvas.height = 8
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, 8, 8)
        const data = ctx.getImageData(0, 0, 8, 8).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++ }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
        const boost = 255 / Math.max(r, g, b, 1)
        setLedColor(`rgb(${Math.min(255, r * boost)},${Math.min(255, g * boost)},${Math.min(255, b * boost)})`)
      } catch (_) {}

      // 4. Revoke blob URL — data is now on the GPU, URL no longer needed.
      //    This removes the blob entry from the DevTools Network preview tab.
      safeRevoke()
    }

    img.onerror = () => { safeRevoke() }

    img.src = activeImageUrl

    return () => {
      cancelled = true
      img.onload  = null
      img.onerror = null
      // Revoke if the image hadn't finished loading when url changed
      safeRevoke()
    }
  }, [activeImageUrl])

  const activeTexture = videoTexture || imageTexture

  // Reset emissive fade counter on texture change
  const prevTextureRef = useRef(null)
  useEffect(() => {
    if (activeTexture && activeTexture !== prevTextureRef.current) {
      prevTextureRef.current     = activeTexture
      emissiveCurrentRef.current = 0
    }
  }, [activeTexture])

  // ── CLEANUP on unmount — explicit texture & material disposal ─────────────
  useEffect(() => {
    return () => {
      if (videoTextureRef.current) videoTextureRef.current.dispose()
      if (imageTextureRef.current) imageTextureRef.current.dispose()
      prevLedMaterialsRef.current.forEach((m) => {
        if (m?.map) m.map.dispose?.()
        if (m?.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose?.()
        m?.dispose?.()
      })
    }
  }, [])

  // ── Sample average color from active video each second ───────────────────
  const colorSampleRef = useRef(null)
  useEffect(() => {
    if (!videoElement) { setLedColor('#ffffff'); return }

    const canvas = document.createElement('canvas')
    canvas.width  = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const sample = () => {
      if (!videoElement || videoElement.paused || videoElement.readyState < 2) return
      try {
        ctx.drawImage(videoElement, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++ }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
        const boost = 255 / Math.max(r, g, b, 1)
        setLedColor(`rgb(${Math.min(255, r * boost)},${Math.min(255, g * boost)},${Math.min(255, b * boost)})`)
      } catch (_) {}
    }

    colorSampleRef.current = setInterval(sample, 800)
    return () => clearInterval(colorSampleRef.current)
  }, [videoElement])

  // ── Material pass — LED + stage ───────────────────────────────────────────
  useEffect(() => {
    if (!clonedScene) return

    prevLedMaterialsRef.current.forEach((m) => {
      if (m?.map) m.map.dispose?.()
      if (m?.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose?.()
      m?.dispose?.()
    })
    prevLedMaterialsRef.current = []
    ledMaterialsRef.current = []

    let found = false
    const newLedPositions = []
    const meshEntries = []

    clonedScene.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow    = true
      child.receiveShadow = true
      // Stage models from C4D/SketchUp often carry unreliable bounds after GLB export.
      // Disabling per-mesh frustum culling avoids "rotate slightly and the stage disappears".
      child.frustumCulled = false
      child.geometry?.computeBoundingBox?.()
      child.geometry?.computeBoundingSphere?.()

      const mats = Array.isArray(child.material) ? child.material : [child.material]
      child.updateWorldMatrix(true, false)
      meshEntries.push({
        child,
        mats,
        box: new THREE.Box3().setFromObject(child),
        worldPosition: child.getWorldPosition(new THREE.Vector3()),
        ledSurfaceType: getLedSurfaceType(...mats.map((mat) => mat?.name), child.name),
        preset: resolveStageMaterialPreset(...mats.map((mat) => mat?.name), child.name),
        tokens: normalizeMaterialTokens(...mats.map((mat) => mat?.name), child.name),
      })
    })

    const ledEntries = meshEntries.filter((entry) => entry.ledSurfaceType)
    const duplicatePolicies = new Map(
      meshEntries
        .map((entry) => [entry.child.uuid, getDuplicateStagePolicy(entry, ledEntries)])
        .filter(([, policy]) => !!policy)
    )

    meshEntries.forEach(({ child, mats, preset }) => {
      const duplicatePolicy = duplicatePolicies.get(child.uuid)
      if (duplicatePolicy === 'hide') {
        child.visible = false
        return
      }

      mats.forEach((mat, i) => {
        if (!mat) return

        const ledSurfaceType = getLedSurfaceType(mat.name, child.name)

        if (ledSurfaceType) {
          found = true

          child.updateWorldMatrix(true, false)
          const box    = new THREE.Box3().setFromObject(child)
          const centre = box.getCenter(new THREE.Vector3())
          newLedPositions.push([centre.x, centre.y, centre.z + 0.5])

          let ledMat
          try {
            if (ledSurfaceType === 'transparent-grid' && transparentLedConfig?.enabled !== false) {
              ledMat = createTransparentLedMaterial(activeTexture, transparentLedConfig)
              child.renderOrder = 4
            } else if (activeTexture) {
              if (protectLed) {
                ledMat = new THREE.MeshBasicMaterial({
                  map:        activeTexture,
                  side:       THREE.DoubleSide,
                  toneMapped: false,
                  polygonOffset: true,
                  polygonOffsetFactor: -2,
                  polygonOffsetUnits: -2,
                })
                child.renderOrder = 3
              } else {
                ledMat = new THREE.MeshStandardMaterial({
                  color:             new THREE.Color(0, 0, 0),
                  map:               activeTexture,
                  emissive:          new THREE.Color(1, 1, 1),
                  emissiveMap:       activeTexture,
                  emissiveIntensity: 0,
                  roughness:         0,
                  metalness:         0,
                  side:              THREE.DoubleSide,
                  toneMapped:        true,
                  polygonOffset:     true,
                  polygonOffsetFactor: -2,
                  polygonOffsetUnits: -2,
                })
                ledMaterialsRef.current.push(ledMat)
                child.renderOrder = 3
              }
            } else {
              ledMat = new THREE.MeshBasicMaterial({
                color: 0x000000,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2,
              })
              child.renderOrder = 3
            }
            ledMat.name = ledSurfaceType === 'transparent-grid' ? TRANSPARENT_LED_MATERIAL_NAME : LED_MATERIAL_NAME
            prevLedMaterialsRef.current.push(ledMat)
            if (Array.isArray(child.material)) child.material[i] = ledMat
            else child.material = ledMat
          } catch {
            ledMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
            ledMat.name = ledSurfaceType === 'transparent-grid' ? TRANSPARENT_LED_MATERIAL_NAME : LED_MATERIAL_NAME
            if (Array.isArray(child.material)) child.material[i] = ledMat
            else child.material = ledMat
          }

        } else {
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            const stageMat = createStableStageMaterial(mat, preset.settings, envIntensity, preset.id)
            prevLedMaterialsRef.current.push(stageMat)
            if (duplicatePolicy === 'non-occluding') {
              stageMat.depthWrite = false
              stageMat.polygonOffsetFactor = 2
              stageMat.polygonOffsetUnits = 2
              stageMat.side = THREE.DoubleSide
              child.renderOrder = 2
            } else {
              child.renderOrder = 1
            }
            if (Array.isArray(child.material)) child.material[i] = stageMat
            else child.material = stageMat
          }
        }
      })
    })

    setLedPositions(newLedPositions)
    onLedMaterialStatus(found)

    const box    = new THREE.Box3().setFromObject(clonedScene)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    clonedScene.position.sub(center)
    clonedScene.position.y += size.y / 2
    clonedScene.updateMatrixWorld(true)

    const normalizedBox = new THREE.Box3().setFromObject(clonedScene)
    const normalizedSize = normalizedBox.getSize(new THREE.Vector3())
    const normalizedCenter = normalizedBox.getCenter(new THREE.Vector3())
    const radius = normalizedSize.length() * 0.5
    onModelMetrics?.({
      box: normalizedBox.clone(),
      center: normalizedCenter.clone(),
      size: normalizedSize.clone(),
      radius,
    })

  }, [clonedScene, activeTexture, onLedMaterialStatus, protectLed, envIntensity, transparentLedConfig, onModelMetrics])

  // ── Per-frame: video texture refresh + emissive fade-in ──────────────────
  useFrame((_, delta) => {
    if (videoTextureRef.current && videoElement && !videoElement.paused) {
      videoTextureRef.current.needsUpdate = true
    }
    if (ledMaterialsRef.current.length > 0) {
      const step = (EMISSIVE_TARGET / EMISSIVE_FADE_SECS) * delta
      emissiveCurrentRef.current = Math.min(emissiveCurrentRef.current + step, EMISSIVE_TARGET)
      ledMaterialsRef.current.forEach(m => { m.emissiveIntensity = emissiveCurrentRef.current })
    }
  })

  return (
    <>
      <primitive object={clonedScene} />
      <LedLights positions={ledPositions} color={ledColor} active={!!activeTexture && sunIntensity > 0} />
    </>
  )
}

function ModelWithUrl({ url, ...rest }) {
  const gltf = useLoader(GLTFLoader, url)
  return <ModelContent gltf={gltf} {...rest} />
}

function ManualModelLoader({ url, loadingManager, onImageTextureLoaded, ...rest }) {
  const [gltf, setGltf] = useState(null)
  const [loadError, setLoadError] = useState(null)
  useEffect(() => {
    if (!url || !loadingManager) return
    setLoadError(null)
    const loader = new GLTFLoader(loadingManager)
    loader.load(
      url,
      (g) => setGltf(g),
      undefined,
      (err) => {
        setGltf(null)
        setLoadError(err instanceof Error ? err : new Error(err?.message || 'Failed to load model'))
      }
    )
  }, [url, loadingManager])
  if (loadError) throw loadError
  if (!gltf) return null
  return <ModelContent gltf={gltf} onImageTextureLoaded={onImageTextureLoaded} {...rest} />
}

function Scene({ modelUrl, videoElement, activeImageUrl, onLedMaterialStatus, protectLed, sunIntensity, envIntensity, transparentLedConfig, loadingManager, onImageTextureLoaded, onModelMetrics }) {
  const common = {
    videoElement,
    activeImageUrl,
    onLedMaterialStatus,
    protectLed,
    sunIntensity,
    envIntensity,
    transparentLedConfig,
    onModelMetrics,
  }
  return (
    <group>
      {modelUrl && (
        loadingManager
          ? <ManualModelLoader url={modelUrl} loadingManager={loadingManager} onImageTextureLoaded={onImageTextureLoaded} {...common} />
          : <ModelWithUrl url={modelUrl} onImageTextureLoaded={onImageTextureLoaded} {...common} />
      )}
    </group>
  )
}

export default Scene

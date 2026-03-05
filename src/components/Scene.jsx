import { useEffect, useRef, useMemo, useState } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const LED_MATERIAL_NAME = 'LED_MASTER_MAT'
const EMISSIVE_TARGET    = 1.5
const EMISSIVE_FADE_SECS = 0.5

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

function ModelContent({ gltf, videoElement, activeImageUrl, onLedMaterialStatus, protectLed, sunIntensity, envIntensity, onImageTextureLoaded }) {
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
    // DISPOSE previous texture
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

  // ── Image texture with explicit disposal (prevents GPU memory leak on swap) ──
  const imageTexture = useMemo(() => {
    if (imageTextureRef.current) {
      imageTextureRef.current.dispose()
      imageTextureRef.current = null
    }
    if (!activeImageUrl) return null
    try {
      const t = new THREE.TextureLoader().load(
        activeImageUrl,
        () => onImageLoadedRef.current?.(),
        undefined,
        () => {}
      )
      t.colorSpace = THREE.SRGBColorSpace
      t.flipY      = false
      t.wrapS      = THREE.ClampToEdgeWrapping
      t.wrapT      = THREE.ClampToEdgeWrapping
      imageTextureRef.current = t
      return t
    } catch {
      return null
    }
  }, [activeImageUrl])

  const activeTexture = videoTexture || imageTexture

  // Reset fade counter on texture change
  const prevTextureRef = useRef(null)
  useEffect(() => {
    if (activeTexture && activeTexture !== prevTextureRef.current) {
      prevTextureRef.current    = activeTexture
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
    canvas.width = canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const sample = () => {
      if (!videoElement || videoElement.paused || videoElement.readyState < 2) return
      try {
        ctx.drawImage(videoElement, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; n++ }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
        const boost = 255 / Math.max(r, g, b, 1)
        setLedColor(`rgb(${Math.min(255,r*boost)},${Math.min(255,g*boost)},${Math.min(255,b*boost)})`)
      } catch (_) {}
    }

    colorSampleRef.current = setInterval(sample, 800)
    return () => clearInterval(colorSampleRef.current)
  }, [videoElement])

  useEffect(() => {
    if (!activeImageUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 8
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, 8, 8)
        const data = ctx.getImageData(0, 0, 8, 8).data
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; n++ }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
        const boost = 255 / Math.max(r, g, b, 1)
        setLedColor(`rgb(${Math.min(255,r*boost)},${Math.min(255,g*boost)},${Math.min(255,b*boost)})`)
      } catch (_) {}
    }
    img.src = activeImageUrl
  }, [activeImageUrl])

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

    clonedScene.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow    = true
      child.receiveShadow = true
      child.frustumCulled = true // FRUSTUM CULLING: enabled by default

      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat, i) => {
        if (!mat) return

        if (mat.name === LED_MATERIAL_NAME) {
          found = true

          child.updateWorldMatrix(true, false)
          const box    = new THREE.Box3().setFromObject(child)
          const centre = box.getCenter(new THREE.Vector3())
          newLedPositions.push([centre.x, centre.y, centre.z + 0.5])

          let ledMat
          try {
            if (activeTexture) {
              if (protectLed) {
                ledMat = new THREE.MeshBasicMaterial({
                  map:        activeTexture,
                  side:       THREE.DoubleSide,
                  toneMapped: false,
                })
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
                })
                ledMaterialsRef.current.push(ledMat)
              }
            } else {
              // ERROR BOUNDARY: No texture = black fallback
              ledMat = new THREE.MeshBasicMaterial({
                color: 0x000000,
                side: THREE.DoubleSide,
              })
            }
            ledMat.name = LED_MATERIAL_NAME
            prevLedMaterialsRef.current.push(ledMat)
            if (Array.isArray(child.material)) child.material[i] = ledMat
            else child.material = ledMat
          } catch {
            // Material creation failed - use black fallback
            ledMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })
            ledMat.name = LED_MATERIAL_NAME
            if (Array.isArray(child.material)) child.material[i] = ledMat
            else child.material = ledMat
          }

        } else {
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            mat.roughness       = Math.min(mat.roughness ?? 1, 0.25)
            mat.metalness       = Math.max(mat.metalness ?? 0, 0.45)
            mat.envMapIntensity = envIntensity ?? 1
            mat.needsUpdate     = true
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

  }, [clonedScene, activeTexture, onLedMaterialStatus, protectLed, envIntensity])

  // ── Per-frame: video texture refresh + emissive fade-in ──────────────────
  useFrame((_, delta) => {
    // Keep video texture current (VideoTexture handles its own loop, but we ensure needsUpdate)
    if (videoTextureRef.current && videoElement && !videoElement.paused) {
      videoTextureRef.current.needsUpdate = true
    }

    // FIX 4 — lerp emissiveIntensity 0 → EMISSIVE_TARGET over EMISSIVE_FADE_SECS
    if (ledMaterialsRef.current.length > 0) {
      const step = (EMISSIVE_TARGET / EMISSIVE_FADE_SECS) * delta
      emissiveCurrentRef.current = Math.min(emissiveCurrentRef.current + step, EMISSIVE_TARGET)
      ledMaterialsRef.current.forEach(m => { m.emissiveIntensity = emissiveCurrentRef.current })
    }
  })

  return (
    <>
      <primitive object={clonedScene} />
      {/* LedLights only fire when sunIntensity > 0 — prevents residual light
          when the user zeroes out all light controls */}
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
  useEffect(() => {
    if (!url || !loadingManager) return
    const loader = new GLTFLoader()
    loader.manager = loadingManager
    loader.load(
      url,
      (g) => setGltf(g),
      undefined,
      () => setGltf(null)
    )
  }, [url, loadingManager])
  if (!gltf) return null
  return <ModelContent gltf={gltf} onImageTextureLoaded={onImageTextureLoaded} {...rest} />
}

function Scene({ modelUrl, videoElement, activeImageUrl, onLedMaterialStatus, protectLed, sunIntensity, envIntensity, loadingManager, onImageTextureLoaded }) {
  const common = {
    videoElement,
    activeImageUrl,
    onLedMaterialStatus,
    protectLed,
    sunIntensity,
    envIntensity,
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

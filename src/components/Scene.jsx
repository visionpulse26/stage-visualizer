import { useEffect, useRef, useMemo, useState } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const LED_MATERIAL_NAME  = 'LED_MASTER_MAT'
const EMISSIVE_TARGET    = 1.5   // final emissiveIntensity in glow mode
const EMISSIVE_FADE_SECS = 0.5   // seconds to reach full brightness on clip swap

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

function Model({ url, videoElement, activeImageUrl, onLedMaterialStatus, protectLed, sunIntensity, envIntensity, screenCrop }) {
  const gltf = useLoader(GLTFLoader, url)
  const videoTextureRef = useRef(null)

  const [ledPositions, setLedPositions] = useState([])
  const [ledColor,     setLedColor]     = useState('#ffffff')

  // Live refs to glow-mode LED materials — updated by useFrame for fade-in
  const ledMaterialsRef    = useRef([])
  const emissiveCurrentRef = useRef(0)

  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf])

  // ── Video texture ─────────────────────────────────────────────────────────
  const videoTexture = useMemo(() => {
    if (!videoElement) return null
    const t = new THREE.VideoTexture(videoElement)
    t.minFilter   = THREE.LinearFilter
    t.magFilter   = THREE.LinearFilter
    // FIX 2 — explicit sRGB color space prevents washed-out / over-saturated colors
    // format is intentionally omitted — Three.js r138+ auto-detects video format
    t.colorSpace  = THREE.SRGBColorSpace
    t.flipY       = false
    t.wrapS       = THREE.ClampToEdgeWrapping
    t.wrapT       = THREE.ClampToEdgeWrapping
    // Disable auto-update so we can drive the matrix manually for crop
    t.matrixAutoUpdate = false
    videoTextureRef.current = t
    return t
  }, [videoElement])

  // ── Texture crop via UV matrix transform ─────────────────────────────────
  // Runs whenever crop values change OR a new videoTexture is created.
  // Uses setUvTransform(tx, ty, sx, sy, rotation, cx, cy) to define the
  // visible window inside the captured frame (e.g. stripping AE timelines).
  useEffect(() => {
    if (!videoTextureRef.current) return
    const { top = 0, bottom = 0, left = 0, right = 0 } = screenCrop ?? {}
    const tl = left   / 100
    const tr = right  / 100
    const tt = top    / 100
    const tb = bottom / 100
    // Clamp to prevent zero-scale which would cause visual glitches
    const scaleX = Math.max(0.01, 1.0 - tl - tr)
    const scaleY = Math.max(0.01, 1.0 - tt - tb)
    videoTextureRef.current.matrix.setUvTransform(tl, tb, scaleX, scaleY, 0, 0, 0)
    videoTextureRef.current.needsUpdate = true
  }, [screenCrop, videoTexture])

  // ── Image texture ─────────────────────────────────────────────────────────
  const imageTexture = useMemo(() => {
    if (!activeImageUrl) return null
    const t = new THREE.TextureLoader().load(activeImageUrl)
    t.colorSpace = THREE.SRGBColorSpace
    t.flipY      = false
    t.wrapS      = THREE.ClampToEdgeWrapping
    t.wrapT      = THREE.ClampToEdgeWrapping
    return t
  }, [activeImageUrl])

  const activeTexture = videoTexture || imageTexture

  // FIX 4 — reset fade counter every time the active texture changes (new clip)
  const prevTextureRef = useRef(null)
  useEffect(() => {
    if (activeTexture && activeTexture !== prevTextureRef.current) {
      prevTextureRef.current    = activeTexture
      emissiveCurrentRef.current = 0   // restart lerp from black
    }
  }, [activeTexture])

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

    ledMaterialsRef.current = []   // clear stale material refs before rebuilding
    let found = false
    const newLedPositions = []

    clonedScene.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow    = true
      child.receiveShadow = true

      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat, i) => {
        if (!mat) return

        if (mat.name === LED_MATERIAL_NAME) {
          found = true

          child.updateWorldMatrix(true, false)
          const box    = new THREE.Box3().setFromObject(child)
          const centre = box.getCenter(new THREE.Vector3())
          newLedPositions.push([centre.x, centre.y, centre.z + 0.5])

          if (activeTexture) {
            let ledMat

            if (protectLed) {
              // PROTECTED — MeshBasicMaterial: zero lighting, zero tone-mapping, pixel-perfect
              ledMat = new THREE.MeshBasicMaterial({
                map:        activeTexture,
                side:       THREE.DoubleSide,
                toneMapped: false,
              })
            } else {
              // GLOW MODE
              // FIX 1 — color: black zeroes the diffuse (map) channel so only
              //          the emissive channel contributes. Prevents double-exposure.
              // FIX 4 — emissiveIntensity starts at 0; useFrame lerps it to target.
              ledMat = new THREE.MeshStandardMaterial({
                color:             new THREE.Color(0, 0, 0),
                map:               activeTexture,   // kept for reflections but muted by black color
                emissive:          new THREE.Color(1, 1, 1),
                emissiveMap:       activeTexture,
                emissiveIntensity: 0,               // fade starts here
                roughness:         0,
                metalness:         0,
                side:              THREE.DoubleSide,
                toneMapped:        true,
              })
              ledMaterialsRef.current.push(ledMat) // register for fade-in
            }

            ledMat.name = LED_MATERIAL_NAME
            if (Array.isArray(child.material)) child.material[i] = ledMat
            else child.material = ledMat
          }

        } else {
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            mat.roughness       = Math.min(mat.roughness ?? 1, 0.25)
            mat.metalness       = Math.max(mat.metalness ?? 0, 0.45)
            // ★ Use user's envIntensity instead of hardcoded value
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
    // Keep video texture current
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

function Scene({ modelUrl, videoElement, activeImageUrl, onLedMaterialStatus, protectLed, sunIntensity, envIntensity, screenCrop }) {
  return (
    <group>
      {modelUrl && (
        <Model
          url={modelUrl}
          videoElement={videoElement}
          activeImageUrl={activeImageUrl}
          onLedMaterialStatus={onLedMaterialStatus}
          protectLed={protectLed}
          sunIntensity={sunIntensity}
          envIntensity={envIntensity}
          screenCrop={screenCrop}
        />
      )}
    </group>
  )
}

export default Scene

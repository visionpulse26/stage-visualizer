import { useEffect, useRef, useMemo, useState } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const LED_MATERIAL_NAME = 'LED_MASTER_MAT'

// ── LED screen light sources ──────────────────────────────────────────────────
// Renders a PointLight at each LED screen position so the screens genuinely
// cast colored light onto the surrounding stage geometry.
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

function Model({ url, videoElement, activeImageUrl, onLedMaterialStatus }) {
  const gltf = useLoader(GLTFLoader, url)
  const videoTextureRef = useRef(null)

  // Positions of LED mesh centres in world space — used to spawn lights
  const [ledPositions, setLedPositions] = useState([])
  // Sampled average color of the current LED content
  const [ledColor, setLedColor]         = useState('#ffffff')

  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf])

  // ── Video texture (updates every frame) ──────────────────────────────────
  const videoTexture = useMemo(() => {
    if (!videoElement) return null
    const t = new THREE.VideoTexture(videoElement)
    t.minFilter   = THREE.LinearFilter
    t.magFilter   = THREE.LinearFilter
    t.format      = THREE.RGBAFormat
    t.colorSpace  = THREE.SRGBColorSpace
    t.flipY       = false
    t.wrapS       = THREE.ClampToEdgeWrapping
    t.wrapT       = THREE.ClampToEdgeWrapping
    videoTextureRef.current = t
    return t
  }, [videoElement])

  // ── Image texture (static) ────────────────────────────────────────────────
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

  // ── Sample average color from active video each second ───────────────────
  const colorSampleRef = useRef(null)
  useEffect(() => {
    if (!videoElement) { setLedColor('#ffffff'); return }

    const canvas  = document.createElement('canvas')
    canvas.width  = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const sample = () => {
      if (!videoElement || videoElement.paused || videoElement.readyState < 2) return
      try {
        ctx.drawImage(videoElement, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
        }
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count)
        // Boost saturation so the light color is vivid, not washed out
        const max = Math.max(r, g, b, 1)
        const boost = 255 / max
        setLedColor(`rgb(${Math.min(255, r * boost)},${Math.min(255, g * boost)},${Math.min(255, b * boost)})`)
      } catch (_) {}
    }

    colorSampleRef.current = setInterval(sample, 800)
    return () => clearInterval(colorSampleRef.current)
  }, [videoElement])

  // When showing a static image, sample its dominant color once
  useEffect(() => {
    if (!activeImageUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 8; canvas.height = 8
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, 8, 8)
        const data = ctx.getImageData(0, 0, 8, 8).data
        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++
        }
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count)
        const max = Math.max(r, g, b, 1)
        const boost = 255 / max
        setLedColor(`rgb(${Math.min(255, r * boost)},${Math.min(255, g * boost)},${Math.min(255, b * boost)})`)
      } catch (_) {}
    }
    img.src = activeImageUrl
  }, [activeImageUrl])

  // ── Material pass — LED + stage materials ─────────────────────────────────
  useEffect(() => {
    if (!clonedScene) return

    let found     = false
    const newLedPositions = []

    clonedScene.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow    = true
      child.receiveShadow = true

      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat, i) => {
        if (!mat) return

        if (mat.name === LED_MATERIAL_NAME) {
          // ── LED screen ──────────────────────────────────────────────────
          found = true

          // Collect world-space centre for the light source
          child.updateWorldMatrix(true, false)
          const box    = new THREE.Box3().setFromObject(child)
          const centre = box.getCenter(new THREE.Vector3())
          // Push light slightly in front of the screen face (toward viewer)
          newLedPositions.push([centre.x, centre.y, centre.z + 0.5])

          if (activeTexture) {
            const ledMat = new THREE.MeshStandardMaterial({
              emissive:          new THREE.Color(1, 1, 1),
              emissiveMap:       activeTexture,
              emissiveIntensity: 2.5,
              roughness:         0,
              metalness:         0,
              side:              THREE.DoubleSide,
              toneMapped:        false,
            })
            ledMat.name = LED_MATERIAL_NAME
            if (Array.isArray(child.material)) child.material[i] = ledMat
            else child.material = ledMat
          }

        } else {
          // ── Stage / structural mesh ─────────────────────────────────────
          // Dark metallic finish so LED light and env map reflect correctly.
          // We reduce roughness and add metalness while keeping the original
          // color/map so the model still looks like the artist intended.
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            mat.roughness        = Math.min(mat.roughness ?? 1, 0.25)
            mat.metalness        = Math.max(mat.metalness ?? 0, 0.45)
            mat.envMapIntensity  = 2.5
            mat.needsUpdate      = true
          }
        }
      })
    })

    setLedPositions(newLedPositions)
    onLedMaterialStatus(found)

    // Centre the model
    const box    = new THREE.Box3().setFromObject(clonedScene)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    clonedScene.position.sub(center)
    clonedScene.position.y += size.y / 2

  }, [clonedScene, activeTexture, onLedMaterialStatus])

  // ── Keep video texture refreshed every frame ──────────────────────────────
  useFrame(() => {
    if (videoTextureRef.current && videoElement && !videoElement.paused) {
      videoTextureRef.current.needsUpdate = true
    }
  })

  return (
    <>
      <primitive object={clonedScene} />
      <LedLights
        positions={ledPositions}
        color={ledColor}
        active={!!activeTexture}
      />
    </>
  )
}

function Scene({ modelUrl, videoElement, activeImageUrl, onLedMaterialStatus }) {
  return (
    <group>
      {modelUrl && (
        <Model
          url={modelUrl}
          videoElement={videoElement}
          activeImageUrl={activeImageUrl}
          onLedMaterialStatus={onLedMaterialStatus}
        />
      )}
    </group>
  )
}

export default Scene

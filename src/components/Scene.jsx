import { useEffect, useRef, useMemo } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

const LED_MATERIAL_NAME = 'LED_MASTER_MAT'

function Model({ url, videoElement, activeImageUrl, onLedMaterialStatus }) {
  const gltf = useLoader(GLTFLoader, url)
  const videoTextureRef = useRef(null)

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

  // ── Active texture: video takes priority over image ───────────────────────
  const activeTexture = videoTexture || imageTexture

  // ── Apply texture to LED_MASTER_MAT ──────────────────────────────────────
  useEffect(() => {
    if (!clonedScene) return

    let found = false

    clonedScene.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow   = true
      child.receiveShadow = true

      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat, i) => {
        if (!mat || mat.name !== LED_MATERIAL_NAME) return
        found = true

        if (activeTexture) {
          const ledMat = new THREE.MeshBasicMaterial({
            map: activeTexture,
            side: THREE.DoubleSide,
            toneMapped: false,
          })
          ledMat.name = LED_MATERIAL_NAME
          if (Array.isArray(child.material)) child.material[i] = ledMat
          else child.material = ledMat
        }
      })
    })

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

  return <primitive object={clonedScene} />
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

import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { CameraControls, Sparkles, Grid, MeshReflectorMaterial, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader'
import * as THREE from 'three'
import Scene from './Scene'

// ── Atmospheric dust particles ────────────────────────────────────────────────
function AtmosphericDust() {
  return (
    <Sparkles
      count={200}
      scale={25}
      size={1.5}
      speed={0.15}
      opacity={0.25}
      color="#ffffff"
    />
  )
}

// ── Reflective floor with MeshReflectorMaterial ───────────────────────────────
function ReflectiveFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <MeshReflectorMaterial
        blur={[300, 100]}
        resolution={1024}
        mixBlur={1}
        mixStrength={40}
        roughness={1}
        depthScale={1.2}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#101010"
        metalness={0.5}
      />
    </mesh>
  )
}

// ── Env intensity controller (Three.js r160 compatible via material traversal) ─
function EnvIntensityController({ intensity }) {
  const { scene } = useThree()
  useEffect(() => {
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = intensity
      return
    }
    scene.traverse(obj => {
      if (!obj.isMesh) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach(m => {
        if (m && m.envMapIntensity !== undefined) m.envMapIntensity = intensity
      })
    })
  }, [scene, intensity])
  return null
}

// (EnvRotationController removed — rotation is handled inside ManagedHdriEnvironment
//  via re-processing the equirectangular texture through PMREM with rotated offset.
//  Three.js 0.160 does not support scene.environmentRotation.)

// ── Tone-mapping controller — ACES + clamped exposure for HDR control ────────
// FIX 3 — toneMappingExposure = 0.8 compresses highlights so video content
//          never clips to pure white before Bloom can evaluate it.
function ToneMappingController() {
  const { gl } = useThree()
  useEffect(() => {
    gl.toneMapping         = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 0.8
  }, [gl])
  return null
}

// ── Managed HDRI Environment ─────────────────────────────────────────────────
// Full lifecycle control with strict disposal, loading lock, memory guard, and
// built-in rotation (Three.js 0.160 lacks scene.environmentRotation).
//
// Rotation: PMREM ignores texture.offset/rotation, so we pre-rotate the
// equirectangular image data using Canvas2D before PMREM processing.
// This is expensive (~50ms) so rotation changes are debounced (300ms).

let sharedPmrem = null
let loadCount   = 0
const ROTATION_DEBOUNCE_MS = 300

function ManagedHdriEnvironment({
  url, ext, background, bgBlur = 0,
  rotationX = 0, rotationY = 0,
  onLoadingChange,
}) {
  const { gl, scene } = useThree()
  const envMapRef     = useRef(null)
  const rawTexRef     = useRef(null)       // original unrotated texture
  const rotatedTexRef = useRef(null)       // canvas-rotated texture for PMREM
  const abortRef      = useRef(null)
  const rotTimerRef   = useRef(null)
  const prevRotRef    = useRef({ x: 0, y: 0 })
  const bgRef         = useRef(background)
  const bgBlurRef     = useRef(bgBlur)
  bgRef.current       = background
  bgBlurRef.current   = bgBlur

  const getPmrem = () => {
    if (!sharedPmrem || sharedPmrem._disposed) {
      sharedPmrem = new THREE.PMREMGenerator(gl)
      sharedPmrem.compileEquirectangularShader()
    }
    return sharedPmrem
  }

  const disposeEnvMap = () => {
    scene.environment = null
    scene.background  = null
    if (envMapRef.current) {
      envMapRef.current.dispose()
      envMapRef.current = null
    }
  }

  const disposeRotatedTex = () => {
    if (rotatedTexRef.current) {
      rotatedTexRef.current.dispose()
      rotatedTexRef.current = null
    }
  }

  const disposeAll = () => {
    disposeEnvMap()
    disposeRotatedTex()
    if (rawTexRef.current) {
      rawTexRef.current.dispose()
      rawTexRef.current = null
    }
  }

  // Create a rotated copy of the equirectangular texture using Canvas2D
  // rotY = horizontal pan (shift pixels left/right, wrapping)
  // rotX = vertical shift (shift pixels up/down, clamping at poles)
  const createRotatedTexture = (srcTex, rotY, rotX) => {
    const img = srcTex.image
    if (!img) return srcTex

    // For HDR data textures (Float/Half arrays), we can't easily use canvas
    // In that case, fall back to the original texture with offset (partial support)
    if (!img.width || !img.height || img instanceof Float32Array || img instanceof Uint16Array) {
      srcTex.offset.set(-rotY / (2 * Math.PI), -rotX / (2 * Math.PI))
      srcTex.wrapS = THREE.RepeatWrapping
      srcTex.wrapT = THREE.ClampToEdgeWrapping
      srcTex.needsUpdate = true
      return srcTex
    }

    const w = img.width
    const h = img.height

    // Calculate pixel shifts
    const shiftX = Math.round((rotY / (2 * Math.PI)) * w) % w
    const shiftY = Math.round((rotX / Math.PI) * h)

    // Create offscreen canvas
    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')

    // Horizontal wrap (rotY) — draw image shifted and wrap around
    if (shiftX !== 0) {
      const absShift = Math.abs(shiftX)
      if (shiftX > 0) {
        ctx.drawImage(img, absShift, 0, w - absShift, h, 0, 0, w - absShift, h)
        ctx.drawImage(img, 0, 0, absShift, h, w - absShift, 0, absShift, h)
      } else {
        ctx.drawImage(img, 0, 0, w - absShift, h, absShift, 0, w - absShift, h)
        ctx.drawImage(img, w - absShift, 0, absShift, h, 0, 0, absShift, h)
      }
    } else {
      ctx.drawImage(img, 0, 0)
    }

    // Vertical shift (rotX) — shift image data up/down with clamping
    if (shiftY !== 0) {
      const imgData = ctx.getImageData(0, 0, w, h)
      const data = imgData.data
      const newData = new Uint8ClampedArray(data.length)

      for (let y = 0; y < h; y++) {
        const srcY = Math.max(0, Math.min(h - 1, y + shiftY))
        for (let x = 0; x < w; x++) {
          const dstIdx = (y * w + x) * 4
          const srcIdx = (srcY * w + x) * 4
          newData[dstIdx]     = data[srcIdx]
          newData[dstIdx + 1] = data[srcIdx + 1]
          newData[dstIdx + 2] = data[srcIdx + 2]
          newData[dstIdx + 3] = data[srcIdx + 3]
        }
      }
      imgData.data.set(newData)
      ctx.putImageData(imgData, 0, 0)
    }

    // Create new texture from rotated canvas
    const rotTex = new THREE.CanvasTexture(canvas)
    rotTex.mapping = THREE.EquirectangularReflectionMapping
    rotTex.colorSpace = srcTex.colorSpace || THREE.SRGBColorSpace
    rotTex.needsUpdate = true
    return rotTex
  }

  // Build env map from the current raw texture + rotation and apply it
  const applyEnvMap = (forceRegen = false) => {
    const rawTex = rawTexRef.current
    if (!rawTex) return

    // Check if rotation actually changed
    const rotChanged = prevRotRef.current.x !== rotationX || prevRotRef.current.y !== rotationY
    if (!forceRegen && !rotChanged && envMapRef.current) return
    prevRotRef.current = { x: rotationX, y: rotationY }

    // Dispose previous env map and rotated texture
    disposeEnvMap()
    disposeRotatedTex()

    // Create rotated texture (or use original if rotation is 0)
    let texForPmrem = rawTex
    if (Math.abs(rotationX) > 0.01 || Math.abs(rotationY) > 0.01) {
      texForPmrem = createRotatedTexture(rawTex, rotationY, rotationX)
      if (texForPmrem !== rawTex) {
        rotatedTexRef.current = texForPmrem
      }
    }

    // Ensure equirectangular mapping
    texForPmrem.mapping = THREE.EquirectangularReflectionMapping

    const pmrem  = getPmrem()
    const envMap = pmrem.fromEquirectangular(texForPmrem).texture
    envMapRef.current = envMap

    scene.environment = envMap
    if (bgRef.current) scene.background = envMap
    if ('backgroundBlurriness' in scene) {
      scene.backgroundBlurriness = bgRef.current ? bgBlurRef.current : 0
    }

    // Memory guard every 5 loads
    loadCount++
    if (loadCount % 5 === 0 && gl.info) {
      const tc = gl.info.memory?.textures ?? 0
      if (tc > 20) console.warn(`[HDRI Memory] Load #${loadCount} — GPU textures: ${tc}`)
      gl.info.reset()
    }
  }

  // ── Load new HDRI when URL changes ──────────────────────────────────────────
  useEffect(() => {
    if (!url) {
      disposeAll()
      onLoadingChange?.(false)
      return
    }

    if (abortRef.current) abortRef.current.aborted = true
    const abortToken = { aborted: false }
    abortRef.current = abortToken

    disposeAll()
    onLoadingChange?.(true)

    const isBlob = url.startsWith('blob:')
    const isExr  = isBlob
      ? (ext || '').toLowerCase() === 'exr'
      : url.toLowerCase().endsWith('.exr')
    const loader = isExr ? new EXRLoader() : new RGBELoader()

    loader.load(
      url,
      (texture) => {
        if (abortToken.aborted) { texture.dispose(); return }
        texture.mapping = THREE.EquirectangularReflectionMapping
        rawTexRef.current = texture
        prevRotRef.current = { x: -999, y: -999 } // force regen
        applyEnvMap(true)
        onLoadingChange?.(false)
      },
      undefined,
      (err) => {
        if (!abortToken.aborted) {
          console.warn('[HDRI] Load failed:', err?.message || err)
          onLoadingChange?.(false)
        }
      },
    )

    return () => {
      abortToken.aborted = true
      disposeAll()
    }
  }, [url, ext, gl, scene])

  // ── Rotation change — debounced PMREM re-process ────────────────────────────
  useEffect(() => {
    if (!rawTexRef.current) return
    if (rotTimerRef.current) clearTimeout(rotTimerRef.current)
    rotTimerRef.current = setTimeout(() => {
      applyEnvMap()
    }, ROTATION_DEBOUNCE_MS)
    return () => { if (rotTimerRef.current) clearTimeout(rotTimerRef.current) }
  }, [rotationX, rotationY])

  // ── Background toggle (no reload) ───────────────────────────────────────────
  useEffect(() => {
    if (!envMapRef.current) return
    scene.background = background ? envMapRef.current : null
  }, [background, scene])

  // ── Background blur ─────────────────────────────────────────────────────────
  useEffect(() => {
    if ('backgroundBlurriness' in scene) {
      scene.backgroundBlurriness = background ? bgBlur : 0
    }
  }, [scene, bgBlur, background])

  // ── Cleanup shared PMREM on full unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (sharedPmrem) { sharedPmrem.dispose(); sharedPmrem = null }
    }
  }, [])

  return null
}

/**
 * Reusable 3D canvas shared across Admin, Collab, and Client views.
 * Accepts scene_config props so all roles see the identical environment.
 */
function StageCanvas({
  modelUrl,
  videoElement,
  activeImageUrl,
  onLedMaterialStatus,
  sunPosition,
  sunIntensity,
  gridCellSize,
  modelLoaded,
  cameraControlsRef,
  // ── Scene config ──────────────────────────────────────────────────────
  hdriPreset,
  customHdriUrl,
  hdriFileExt,          // 'hdr' | 'exr' — required for blob: URLs (no extension in URL)
  hdriRotationX,        // 0 to 2π — HDRI rotation around X axis
  hdriRotationY,        // 0 to 2π — HDRI rotation around Y axis
  onHdriLoading,        // callback(boolean) — loading lock for UI
  envIntensity,
  bgBlur,
  bloomStrength,
  bloomThreshold,       // 0.0 – 2.0  only pixels above this luminance bloom
  protectLed,           // boolean    isolate LED material from env/tone mapping
  showHdriBackground,   // boolean    show HDRI as visible background (Stealth = OFF)
  children,
}) {
  const hasEnv        = !!(customHdriUrl || (hdriPreset && hdriPreset !== 'none'))
  const resolvedBloom     = bloomStrength      ?? 0.3
  const resolvedEnvInt    = envIntensity       ?? 1
  const resolvedBgBlur    = bgBlur             ?? 0
  const resolvedShowBg    = showHdriBackground ?? false

  // FIX 5 — auto-raise threshold when LED is protected so bloom doesn't eat
  //          into visual content. Manual slider still controls the floor value.
  const resolvedThreshold = protectLed
    ? Math.max(bloomThreshold ?? 1.2, 1.5)
    : (bloomThreshold ?? 1.2)

  return (
    <div className="w-full h-full relative bg-[#0a0a0c]">
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{
          antialias:             true,
          alpha:                 false,
          preserveDrawingBuffer: true,
          toneMapping:           THREE.ACESFilmicToneMapping,
          toneMappingExposure:   0.8,   // FIX 3 — clamp HDR highlights
        }}
        shadows
      >
        {/* ACES filmic tone mapping — hardcoded for cinema quality */}
        <ToneMappingController />

        {/* Background — black in stealth mode, overridden by HDRI when visible */}
        <color attach="background" args={['#000000']} />
        <fog   attach="fog"        args={['#0a0a0c', 15, 60]} />

        {/* HDRI Environment — managed loader with proper .dispose() lifecycle.
            customHdriUrl  → ManagedHdriEnvironment (blob or NAS URL, manual load)
            hdriPreset     → drei <Environment preset> (backward compat, small 1K files) */}
        {hasEnv && (
          <>
            {customHdriUrl ? (
              <ManagedHdriEnvironment
                url={customHdriUrl}
                ext={hdriFileExt}
                background={resolvedShowBg}
                onLoadingChange={onHdriLoading}
                bgBlur={resolvedBgBlur}
                rotationX={hdriRotationX ?? 0}
                rotationY={hdriRotationY ?? 0}
              />
            ) : (
              resolvedShowBg
                ? <Environment preset={hdriPreset} background backgroundBlurriness={resolvedBgBlur} />
                : <Environment preset={hdriPreset} />
            )}
            <EnvIntensityController intensity={resolvedEnvInt} />
          </>
        )}

        {/* Lighting
            ambientLight scales with sunIntensity so dragging sun to 0 kills
            all ambient fill as well — no residual glow when everything is off. */}
        <ambientLight intensity={sunIntensity * 0.15} />
        <directionalLight
          position={sunPosition}
          intensity={sunIntensity}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={50}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />

        {/* Placeholder cube — only shown before a model is loaded */}
        {!modelLoaded && (
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#8b5cf6" />
          </mesh>
        )}

        {/* Reflective floor */}
        <ReflectiveFloor />

        {/* Infinite grid */}
        <Grid
          position={[0, -0.05, 0]}
          infiniteGrid
          fadeDistance={40}
          fadeStrength={2}
          cellSize={gridCellSize}
          sectionSize={gridCellSize * 5}
          cellColor="#333333"
          sectionColor="#666666"
        />

        <AtmosphericDust />

        <Suspense fallback={null}>
          {modelUrl && (
            <Scene
              modelUrl={modelUrl}
              videoElement={videoElement}
              activeImageUrl={activeImageUrl}
              onLedMaterialStatus={onLedMaterialStatus}
              protectLed={protectLed ?? true}
              sunIntensity={sunIntensity ?? 1}
            />
          )}
        </Suspense>

        <CameraControls
          ref={cameraControlsRef}
          makeDefault
          smoothTime={0.5}
          dollySpeed={0.5}
        />

        {/* Bloom — luminanceThreshold driven by admin slider */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={resolvedThreshold}
            luminanceSmoothing={0.9}
            intensity={resolvedBloom}
          />
        </EffectComposer>
      </Canvas>

      {children}
    </div>
  )
}

export default StageCanvas

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

// ── Env rotation controller — rotates both environment and background ─────────
function EnvRotationController({ rotationX = 0, rotationY = 0 }) {
  const { scene } = useThree()
  useEffect(() => {
    const euler = new THREE.Euler(rotationX, rotationY, 0, 'XYZ')
    if ('environmentRotation' in scene) {
      scene.environmentRotation.copy(euler)
    }
    if ('backgroundRotation' in scene) {
      scene.backgroundRotation.copy(euler)
    }
  }, [scene, rotationX, rotationY])
  return null
}

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
// Full lifecycle control with strict disposal, loading lock, and memory guard.
// Prevents GPU memory leaks when cycling through 100+ high-res EXR files.

// Singleton PMREMGenerator — reused across all loads instead of creating new ones
let sharedPmrem = null
let loadCount   = 0

function ManagedHdriEnvironment({ url, ext, background, bgBlur = 0, onLoadingChange }) {
  const { gl, scene } = useThree()
  const envMapRef     = useRef(null)
  const rawTexRef     = useRef(null)
  const abortRef      = useRef(null)
  const loadingRef    = useRef(false)
  const bgRef         = useRef(background)
  const bgBlurRef     = useRef(bgBlur)
  bgRef.current       = background
  bgBlurRef.current   = bgBlur

  // Helper: strict cleanup of current textures
  const disposeCurrentHdri = () => {
    scene.environment = null
    scene.background  = null
    if (envMapRef.current) {
      envMapRef.current.dispose()
      envMapRef.current = null
    }
    if (rawTexRef.current) {
      rawTexRef.current.dispose()
      rawTexRef.current = null
    }
  }

  // Memory guard: check every 5 loads
  const checkMemory = () => {
    loadCount++
    if (loadCount % 5 === 0 && gl.info) {
      const texCount = gl.info.memory?.textures ?? 0
      console.log(`[HDRI Memory] Load #${loadCount} — GPU textures: ${texCount}`)
      if (texCount > 20) {
        console.warn('[HDRI Memory] High texture count detected! Possible leak.')
      }
      gl.info.reset()
    }
  }

  useEffect(() => {
    if (!url) {
      disposeCurrentHdri()
      onLoadingChange?.(false)
      return
    }

    // Abort any previous load in progress
    if (abortRef.current) {
      abortRef.current.aborted = true
    }
    const abortToken = { aborted: false }
    abortRef.current = abortToken

    // STRICT DISPOSAL — clear old HDRI BEFORE starting new load
    disposeCurrentHdri()

    // Set loading lock
    loadingRef.current = true
    onLoadingChange?.(true)

    const isBlob = url.startsWith('blob:')
    const isExr  = isBlob
      ? (ext || '').toLowerCase() === 'exr'
      : url.toLowerCase().endsWith('.exr')
    const loader = isExr ? new EXRLoader() : new RGBELoader()

    // Initialize or reuse shared PMREM generator
    if (!sharedPmrem || sharedPmrem.disposed) {
      sharedPmrem = new THREE.PMREMGenerator(gl)
      sharedPmrem.compileEquirectangularShader()
    }

    loader.load(
      url,
      (texture) => {
        // Check abort token — if user selected a different HDRI, discard this result
        if (abortToken.aborted) {
          texture.dispose()
          return
        }

        rawTexRef.current = texture

        // Generate env map using shared PMREM
        const envMap = sharedPmrem.fromEquirectangular(texture).texture
        envMapRef.current = envMap

        // Apply to scene
        scene.environment = envMap
        if (bgRef.current) scene.background = envMap
        if ('backgroundBlurriness' in scene) {
          scene.backgroundBlurriness = bgRef.current ? bgBlurRef.current : 0
        }

        // Release loading lock
        loadingRef.current = false
        onLoadingChange?.(false)

        // Memory guard
        checkMemory()
      },
      undefined,
      (err) => {
        if (!abortToken.aborted) {
          console.warn('[HDRI] Load failed:', err?.message || err)
          loadingRef.current = false
          onLoadingChange?.(false)
        }
      },
    )

    return () => {
      abortToken.aborted = true
      disposeCurrentHdri()
      loadingRef.current = false
    }
  }, [url, ext, gl, scene, onLoadingChange])

  // Toggle background visibility without reloading the texture
  useEffect(() => {
    if (!envMapRef.current) return
    scene.background = background ? envMapRef.current : null
  }, [background, scene])

  // Background blur
  useEffect(() => {
    if ('backgroundBlurriness' in scene) {
      scene.backgroundBlurriness = background ? bgBlur : 0
    }
  }, [scene, bgBlur, background])

  // Cleanup shared PMREM when component fully unmounts (page navigation)
  useEffect(() => {
    return () => {
      if (sharedPmrem) {
        sharedPmrem.dispose()
        sharedPmrem = null
      }
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
              />
            ) : (
              resolvedShowBg
                ? <Environment preset={hdriPreset} background backgroundBlurriness={resolvedBgBlur} />
                : <Environment preset={hdriPreset} />
            )}
            <EnvIntensityController intensity={resolvedEnvInt} />
            <EnvRotationController rotationX={hdriRotationX ?? 0} rotationY={hdriRotationY ?? 0} />
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

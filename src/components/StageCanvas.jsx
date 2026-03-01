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

// LITE & STABLE: All rotation logic removed to prevent GPU crashes.
// Using simple LiteHdriEnvironment with aggressive cleanup.

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

// ── LITE & STABLE HDRI Environment ──────────────────────────────────────────
// Simplified system: NO rotation, AGGRESSIVE cleanup, BULLETPROOF loading.
// Only loads url_low versions to keep GPU cool on RTX 4080.

const LOAD_TIMEOUT_MS = 10000 // 10 second timeout

function LiteHdriEnvironment({
  url,
  ext,
  background = false,
  bgBlur = 0,
  onLoadingChange,
  onLoadError,
  onClearRequest,  // callback to notify parent when we need to clear (on fatal error)
}) {
  const { gl, scene } = useThree()
  const envMapRef   = useRef(null)
  const rawTexRef   = useRef(null)
  const pmremRef    = useRef(null)
  const abortRef    = useRef(null)
  const timeoutRef  = useRef(null)

  // ═══════════════════════════════════════════════════════════════════════════
  // AGGRESSIVE MEMORY CLEANUP — mandatory for RTX 4080 VRAM stability
  // ═══════════════════════════════════════════════════════════════════════════
  const deepCleanup = useCallback(() => {
    console.log('[HDRI Lite] Deep cleanup triggered')
    
    // 1. Clear scene references FIRST
    scene.background = null
    scene.environment = null
    
    // 2. Dispose env map
    if (envMapRef.current) {
      envMapRef.current.dispose()
      try { gl.initTexture?.(envMapRef.current) } catch (_) {}
      envMapRef.current = null
    }
    
    // 3. Dispose raw texture
    if (rawTexRef.current) {
      rawTexRef.current.dispose()
      try { gl.initTexture?.(rawTexRef.current) } catch (_) {}
      rawTexRef.current = null
    }
    
    // 4. Dispose PMREM generator
    if (pmremRef.current) {
      pmremRef.current.dispose()
      pmremRef.current = null
    }
    
    // 5. Force GPU memory reset
    if (gl.info) {
      gl.info.reset()
      console.log('[HDRI Lite] GPU textures after cleanup:', gl.info.memory?.textures ?? 0)
    }
    
    // 6. Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [gl, scene])

  // ═══════════════════════════════════════════════════════════════════════════
  // BULLETPROOF LOADER — try/catch/finally guarantees spinner stops
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // No URL = clear everything
    if (!url) {
      deepCleanup()
      onLoadingChange?.(false)
      return
    }

    // Abort previous load
    if (abortRef.current) abortRef.current.aborted = true
    const abortToken = { aborted: false }
    abortRef.current = abortToken

    // AGGRESSIVE CLEANUP before loading
    deepCleanup()
    onLoadingChange?.(true)

    // Validate URL
    const isValidUrl = url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')
    if (!isValidUrl) {
      console.warn('[HDRI Lite] Invalid URL:', url)
      onLoadingChange?.(false)
      onLoadError?.('Invalid URL format')
      onClearRequest?.()
      return
    }

    // Determine loader type
    const isBlob = url.startsWith('blob:')
    const isExr = isBlob
      ? (ext || '').toLowerCase() === 'exr'
      : url.toLowerCase().endsWith('.exr')
    const loader = isExr ? new EXRLoader() : new RGBELoader()

    // Set timeout for stuck loads
    timeoutRef.current = setTimeout(() => {
      if (!abortToken.aborted) {
        console.error('[HDRI Lite] Load timeout (10s):', url)
        abortToken.aborted = true
        onLoadingChange?.(false)
        onLoadError?.('Load timed out')
        alert('HDRI failed to load (timeout)')
        onClearRequest?.()
      }
    }, LOAD_TIMEOUT_MS)

    // ── BULLETPROOF LOAD with try/catch/finally ──
    try {
      loader.load(
        url,
        // Success
        (texture) => {
          // Clear timeout
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
          
          if (abortToken.aborted) {
            texture.dispose()
            return
          }

          try {
            // Create PMREM
            pmremRef.current = new THREE.PMREMGenerator(gl)
            pmremRef.current.compileEquirectangularShader()
            
            texture.mapping = THREE.EquirectangularReflectionMapping
            rawTexRef.current = texture
            
            const envMap = pmremRef.current.fromEquirectangular(texture).texture
            envMapRef.current = envMap
            
            // Apply to scene
            scene.environment = envMap
            if (background) scene.background = envMap
            if ('backgroundBlurriness' in scene) {
              scene.backgroundBlurriness = background ? bgBlur : 0
            }
            
            console.log('[HDRI Lite] Loaded successfully')
          } catch (applyErr) {
            console.error('[HDRI Lite] Apply error:', applyErr)
            texture.dispose()
            alert('HDRI failed to load')
            onClearRequest?.()
          } finally {
            // ★ MANDATORY: Always clear loading state
            onLoadingChange?.(false)
          }
        },
        // Progress (unused)
        undefined,
        // Error
        (err) => {
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
          
          if (!abortToken.aborted) {
            console.error('[HDRI Lite] Load error:', err)
            onLoadingChange?.(false)
            onLoadError?.(err?.message || 'Load failed')
            alert('HDRI failed to load')
            onClearRequest?.()
          }
        }
      )
    } catch (syncErr) {
      // Catch synchronous errors
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      console.error('[HDRI Lite] Sync error:', syncErr)
      onLoadingChange?.(false)
      onLoadError?.(syncErr?.message || 'Load failed')
      alert('HDRI failed to load')
      onClearRequest?.()
    }

    return () => {
      abortToken.aborted = true
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      deepCleanup()
    }
  }, [url, ext, background, bgBlur, gl, scene, deepCleanup, onLoadingChange, onLoadError, onClearRequest])

  // Background toggle (no reload needed)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => deepCleanup()
  }, [deepCleanup])

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
  onHdriLoading,        // callback(boolean) — loading lock for UI
  onHdriLoadError,      // callback(errorMsg) — when HDRI fails
  onHdriClearRequest,   // callback() — request to clear HDRI (on fatal error)
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

        {/* HDRI Environment — LITE & STABLE version
            customHdriUrl  → LiteHdriEnvironment (url_low only, no rotation)
            hdriPreset     → drei <Environment preset> (backward compat, small 1K files) */}
        {hasEnv && (
          <>
            {customHdriUrl ? (
              <LiteHdriEnvironment
                url={customHdriUrl}
                ext={hdriFileExt}
                background={resolvedShowBg}
                bgBlur={resolvedBgBlur}
                onLoadingChange={onHdriLoading}
                onLoadError={onHdriLoadError}
                onClearRequest={onHdriClearRequest}
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

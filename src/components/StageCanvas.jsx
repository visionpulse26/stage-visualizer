import { Component, Suspense, lazy, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import StageErrorBoundary from './StageErrorBoundary'
import { Canvas, useFrame } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CameraControls, Sparkles, Grid, MeshReflectorMaterial, Environment, ContactShadows } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField } from '@react-three/postprocessing'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import Scene from './Scene'

const LazyPovFpsRig = lazy(() =>
  import('./PovFpsRig').then((mod) => ({ default: mod.PovFpsRig }))
)
const LazyPovSimpleRig = lazy(() =>
  import('./PovSimpleRig').then((mod) => ({ default: mod.PovSimpleRig }))
)

function canEvaluateCode() {
  try {
    // Rapier's compatibility WASM path may use generated functions. If the
    // deployed CSP blocks eval, skip that path before it can blank the page.
    Function('return true')()
    return true
  } catch {
    return false
  }
}

class PovRuntimeBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error, info) {
    console.error('[PovRuntimeBoundary]', error, info)
    this.props.onError?.(error)
  }
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

/** Exposes `gl.domElement` so pages can call `cameraControls.connect(canvas)` after POV. */
function GlDomElementBridge({ targetRef }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!targetRef) return
    targetRef.current = gl.domElement
    return () => {
      targetRef.current = null
    }
  }, [gl, targetRef])
  return null
}

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
        blur={[180, 64]}
        resolution={1024}
        mixBlur={0.65}
        mixStrength={14}
        roughness={0.95}
        depthScale={0.8}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#090909"
        metalness={0.12}
      />
    </mesh>
  )
}

// ── Env intensity controller (Three.js r160 compatible via material traversal)
// Skips LED_MASTER_MAT when protectLed — LED stays unlit, no HDRI wash ────────
function EnvIntensityController({ intensity, protectLed }) {
  const { scene } = useThree()
  useEffect(() => {
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = intensity
    }
    scene.traverse(obj => {
      if (!obj.isMesh) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach(m => {
        if (!m || m.envMapIntensity === undefined) return
        if (protectLed && m.name === 'LED_MASTER_MAT') {
          m.envMapIntensity = 0
          return
        }
        const scale = m.userData?.envIntensityScale ?? 1
        m.envMapIntensity = scale * intensity
      })
    })
  }, [scene, intensity, protectLed])
  return null
}

// LITE & STABLE: All rotation logic removed to prevent GPU crashes.
// Using simple LiteHdriEnvironment with aggressive cleanup.

// ── WebGL context loss handler — shows fallback UI when GPU context is lost ───
function WebGLContextLossHandler({ onContextLost, onContextRestored }) {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const handleLost = (e) => {
      e.preventDefault()
      onContextLost?.()
    }
    const handleRestored = () => onContextRestored?.()
    canvas.addEventListener('webglcontextlost', handleLost)
    canvas.addEventListener('webglcontextrestored', handleRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost)
      canvas.removeEventListener('webglcontextrestored', handleRestored)
    }
  }, [gl, onContextLost, onContextRestored])
  return null
}

// ── First-frame reporter — registers "firstframe" with LoadingManager so onLoad waits for GPU render ─
function FirstFrameReporter({ loadingManager }) {
  const fired = useRef(false)
  const started = useRef(false)
  useEffect(() => {
    if (!loadingManager || started.current) return
    started.current = true
    loadingManager.itemStart?.('firstframe')
  }, [loadingManager])
  useFrame(() => {
    if (fired.current || !loadingManager) return
    fired.current = true
    loadingManager.itemEnd?.('firstframe')
  })
  return null
}

// ── Tone-mapping controller — ACES + clamped exposure for HDR control ────────
function ToneMappingController() {
  const { gl } = useThree()
  useEffect(() => {
    gl.toneMapping         = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 0.62
  }, [gl])
  return null
}

function PovClipGuard({ enabled, modelMetrics }) {
  const { camera, scene } = useThree()

  useEffect(() => {
    if (!enabled || !modelMetrics) return

    const prevNear = camera.near
    const prevFar = camera.far
    const prevFogNear = scene.fog?.near
    const prevFogFar = scene.fog?.far
    const radius = Math.max(modelMetrics.radius || 0, 1)
    const maxDim = Math.max(modelMetrics.size?.x || 0, modelMetrics.size?.y || 0, modelMetrics.size?.z || 0, 1)

    camera.near = 0.02
    camera.far = Math.max(prevFar, radius * 120, maxDim * 120, 5000)
    camera.updateProjectionMatrix()

    if (scene.fog) {
      scene.fog.near = Math.max(800, radius * 20, maxDim * 12)
      scene.fog.far = Math.max(2400, radius * 60, maxDim * 36)
    }

    return () => {
      camera.near = prevNear
      camera.far = prevFar
      camera.updateProjectionMatrix()
      if (scene.fog && prevFogNear != null && prevFogFar != null) {
        scene.fog.near = prevFogNear
        scene.fog.far = prevFogFar
      }
    }
  }, [enabled, modelMetrics, camera, scene])

  return null
}

function LocalStudioEnvironment({ intensity = 1, background = false, bgBlur = 0 }) {
  const { gl, scene } = useThree()

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envScene = new RoomEnvironment()
    const envMap = pmrem.fromScene(envScene, 0.04).texture

    scene.environment = envMap
    if (background) scene.background = envMap
    if ('backgroundBlurriness' in scene) {
      scene.backgroundBlurriness = background ? bgBlur : 0
    }
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = intensity
    }

    return () => {
      if (scene.environment === envMap) scene.environment = null
      if (scene.background === envMap) scene.background = null
      envMap.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, intensity, background, bgBlur])

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
  onLoadComplete,  // optional: called when HDRI loaded (for blob URL revocation)
  loadingManager,  // optional THREE.LoadingManager for progress tracking
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
    scene.background = null
    scene.environment = null
    
    if (envMapRef.current) {
      envMapRef.current.dispose()
      try { gl.initTexture?.(envMapRef.current) } catch (_) {}
      envMapRef.current = null
    }
    
    if (rawTexRef.current) {
      rawTexRef.current.dispose()
      try { gl.initTexture?.(rawTexRef.current) } catch (_) {}
      rawTexRef.current = null
    }
    
    if (pmremRef.current) {
      pmremRef.current.dispose()
      pmremRef.current = null
    }
    
    if (gl.info) gl.info.reset()
    
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

    const isValidUrl = url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')
    if (!isValidUrl) {
      onLoadingChange?.(false)
      onLoadError?.('Invalid URL format')
      onClearRequest?.()
      return
    }

    const isBlob = url.startsWith('blob:')
    const isExr = isBlob
      ? (ext || '').toLowerCase() === 'exr'
      : url.toLowerCase().endsWith('.exr')
    const loader = isExr ? new EXRLoader() : new RGBELoader()
    if (loadingManager) loader.manager = loadingManager

    const loadUrl = isBlob ? url : `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`

    timeoutRef.current = setTimeout(() => {
      if (!abortToken.aborted) {
        abortToken.aborted = true
        onLoadingChange?.(false)
        onLoadError?.('Load timed out')
        onClearRequest?.()
      }
    }, LOAD_TIMEOUT_MS)

    try {
      loader.load(
        loadUrl,
        (texture) => {
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
          
          if (abortToken.aborted) {
            texture.dispose()
            return
          }

          try {
            pmremRef.current = new THREE.PMREMGenerator(gl)
            pmremRef.current.compileEquirectangularShader()
            
            texture.mapping = THREE.EquirectangularReflectionMapping
            rawTexRef.current = texture
            
            const envMap = pmremRef.current.fromEquirectangular(texture).texture
            envMapRef.current = envMap
            
            scene.environment = envMap
            if (background) scene.background = envMap
            if ('backgroundBlurriness' in scene) {
              scene.backgroundBlurriness = background ? bgBlur : 0
            }
            onLoadComplete?.()
          } catch {
            texture.dispose()
            onClearRequest?.()
          } finally {
            onLoadingChange?.(false)
          }
        },
        undefined,
        (err) => {
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
          
          if (!abortToken.aborted) {
            onLoadingChange?.(false)
            onLoadError?.(err?.message || 'Load failed')
            onClearRequest?.()
          }
        }
      )
    } catch (syncErr) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      onLoadingChange?.(false)
      onLoadError?.(syncErr?.message || 'Load failed')
      onClearRequest?.()
    }

    return () => {
      abortToken.aborted = true
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      deepCleanup()
    }
  }, [url, ext, background, bgBlur, gl, scene, deepCleanup, onLoadingChange, onLoadError, onClearRequest, onLoadComplete, loadingManager])

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

// ── Smooth camera fly via LERP in render loop ────────────────────────────────
// Must use setLookAt() each frame — controls.update() overwrites camera.position
// flyDurationSeconds: higher = slower, more cinematic (1–10)
const BASE_LERP = 10
const REACHED_THRESHOLD = 0.002

function lerp3(current, target, speed, delta) {
  const factor = 1 - Math.exp(-speed * delta)
  return current.lerp(target, factor)
}

function CameraSmoothFlyController({ cameraControlsRef, targetPresetRef, flyDurationSeconds = 4 }) {
  const duration = Math.max(1, Math.min(10, Number(flyDurationSeconds) || 4))
  const lerpSpeed = BASE_LERP / duration
  const { camera } = useThree()
  const targetPos = useRef(new THREE.Vector3())
  const targetLookAt = useRef(new THREE.Vector3())
  const currentPos = useRef(new THREE.Vector3())
  const currentLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    const controls = cameraControlsRef?.current
    if (!controls || !targetPresetRef) return
    const onControlStart = () => { targetPresetRef.current = null }
    controls.addEventListener?.('controlstart', onControlStart)
    return () => controls.removeEventListener?.('controlstart', onControlStart)
  }, [cameraControlsRef, targetPresetRef])

  useFrame((_, delta) => {
    const controls = cameraControlsRef?.current
    if (!controls) return
    const preset = targetPresetRef?.current
    if (!preset) return
    const pos = preset.position
    const tgt = preset.target
    if (!pos || !tgt || typeof pos.x !== 'number' || typeof tgt.x !== 'number') return

    targetPos.current.set(pos.x, pos.y, pos.z)
    targetLookAt.current.set(tgt.x, tgt.y, tgt.z)

    // Copy current state from camera and controls
    currentPos.current.copy(camera.position)
    controls.getTarget(currentLookAt.current)

    // Lerp both position and target
    lerp3(currentPos.current, targetPos.current, lerpSpeed, delta)
    lerp3(currentLookAt.current, targetLookAt.current, lerpSpeed, delta)

    // Drive controls via setLookAt — update() would overwrite camera otherwise
    controls.setLookAt(
      currentPos.current.x,
      currentPos.current.y,
      currentPos.current.z,
      currentLookAt.current.x,
      currentLookAt.current.y,
      currentLookAt.current.z,
      false
    )
    controls.update(delta)

    if (
      currentPos.current.distanceTo(targetPos.current) < REACHED_THRESHOLD &&
      currentLookAt.current.distanceTo(targetLookAt.current) < REACHED_THRESHOLD
    ) {
      targetPresetRef.current = null
    }
  })
  return null
}

function CameraAutoFrame({ cameraControlsRef, modelMetrics, modelUrl, reframeKey }) {
  const { camera } = useThree()
  const framedUrlRef = useRef(null)

  useEffect(() => {
    if (!modelUrl) {
      framedUrlRef.current = null
      return
    }
    const controls = cameraControlsRef?.current
    // Re-frame on a new model OR when reframeKey changes (e.g. device rotation),
    // so a portrait->landscape switch refits the stage instead of staying zoomed.
    const frameId = `${modelUrl}::${reframeKey ?? ''}`
    if (!controls || !modelMetrics || framedUrlRef.current === frameId) return

    const { center, size, radius } = modelMetrics
    const maxDim = Math.max(size?.x || 0, size?.y || 0, size?.z || 0, 1)
    const distance = Math.max(radius * 1.8, maxDim * 1.35, 8)
    const yLift = Math.max(size?.y || 0, 2) * 0.35
    camera.near = Math.max(0.05, Math.min(1, radius / 300 || 0.05))
    camera.far = Math.max(2000, radius * 40, maxDim * 35)
    camera.updateProjectionMatrix()

    controls.setLookAt(
      center.x + distance,
      center.y + yLift + distance * 0.32,
      center.z + distance,
      center.x,
      center.y + Math.max((size?.y || 0) * 0.18, 0.8),
      center.z,
      true
    )

    framedUrlRef.current = frameId
  }, [camera, cameraControlsRef, modelMetrics, modelUrl, reframeKey])

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
  cameraTargetPresetRef,
  cameraFlyDurationSeconds,
  // ── Stage loading (Client/Collab — THREE.LoadingManager for progress) ───
  loadingManager,       // optional THREE.LoadingManager
  onImageTextureLoaded, // optional: callback when image texture finishes loading (for blob revoke)
  // ── Scene config ──────────────────────────────────────────────────────
  hdriPreset,
  customHdriUrl,
  hdriFileExt,
  onHdriLoading,
  onHdriLoadError,
  onHdriClearRequest,
  onHdriLoadComplete,
  envIntensity,
  bgBlur,
  bloomStrength,
  bloomThreshold,
  protectLed,
  transparentLedConfig,
  showHdriBackground,
  /** Fires when the loaded model's bounding metrics update (for POV / framing). */
  onModelMetricsChange,
  /** When true, orbit auto-frame & preset fly are paused (POV mode). */
  povMode = false,
  /** Standing eye height (m) — model normalized with floor at y≈0. */
  povHeightOffset = 1.7,
  /** Called from the host page on Esc / Exit POV to restore orbit (not tied to pointer-lock loss). */
  onPovExitRequest,
  onPovDebugEvent,
  /** Set to `gl.domElement` for reconnecting orbit controls after POV. */
  glDomElementRef,
  /** Fires with MeshMeta[] after the model is normalized — used by Admin to build collider config. */
  onMeshScanChange,
  /** Pre-computed PovColliderSpec[] from host page (Admin/Collab); passed straight to PovFpsRig. */
  stageColliders = [],
  /** Changing this re-runs auto-framing (e.g. device rotation on mobile). */
  reframeKey,
  children,
}) {
  const internalPresetRef = useRef(null)
  const presetRef = cameraTargetPresetRef ?? internalPresetRef
  const [contextLost, setContextLost] = useState(false)
  const [modelMetrics, setModelMetrics] = useState(null)
  const [povEvalAllowed, setPovEvalAllowed] = useState(null)
  const handleModelMetrics = useCallback(
    (m) => {
      setModelMetrics(m)
      onModelMetricsChange?.(m)
    },
    [onModelMetricsChange],
  )
  const handleContextLost = useCallback(() => setContextLost(true), [])
  const handleContextRestored = useCallback(() => setContextLost(false), [])
  const handlePovRuntimeError = useCallback(
    (error) => {
      onPovDebugEvent?.('pov-runtime-error', error?.message || 'POV runtime error')
      onPovExitRequest?.()
    },
    [onPovDebugEvent, onPovExitRequest],
  )

  const povGeofencePadding = useMemo(() => {
    if (!modelMetrics?.size) return 1.5
    const xz = Math.max(modelMetrics.size.x, modelMetrics.size.z)
    return Math.max(1.0, xz * 0.35)
  }, [modelMetrics])

  // Auto-scale move speed so the stage feels responsive regardless of model units
  // (meters, cm, etc.). Formula: ~1.54s to cross the stage at full sprint.
  const povMoveSpeed = useMemo(() => {
    if (!modelMetrics?.size) return 9
    const xz = Math.max(modelMetrics.size.x, modelMetrics.size.z)
    return Math.max(9, xz * 0.65)
  }, [modelMetrics])

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

  const blockFriction = useCallback((e) => {
    // Only block drag on the 3D canvas itself, not on UI panel children that
    // implement their own drag (e.g. playlist reorder). If the drag originates
    // from a [draggable] element inside a .ui-panel subtree, let it through.
    if (e.target.closest && e.target.closest('[data-ui-panel]')) return
    e.preventDefault()
  }, [])

  useEffect(() => {
    setModelMetrics(null)
  }, [modelUrl])

  useEffect(() => {
    if (!povMode) return
    if (povEvalAllowed == null) {
      setPovEvalAllowed(canEvaluateCode())
      return
    }
    if (!povEvalAllowed) {
      onPovDebugEvent?.('pov-csp-fallback', 'unsafe-eval blocked; using software POV rig')
    }
  }, [povMode, povEvalAllowed, onPovDebugEvent])

  return (
    <div
      className="w-full h-full relative bg-[#0a0a0c]"
      onContextMenu={blockFriction}
      onDragStart={blockFriction}
    >
      {contextLost && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0c]"
          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
        >
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <p
              className="text-2xl sm:text-3xl font-bold tracking-widest animate-pulse"
              style={{ color: '#FF5F1F' }}
            >
              SYSTEM REBOOTING...
            </p>
            <p className="text-white/50 text-sm">
              WebGL context lost. Attempting recovery...
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2.5 rounded-xl border font-medium transition-all hover:bg-[#FF5F1F]/20"
              style={{
                color: '#FF5F1F',
                borderColor: '#FF5F1F',
              }}
            >
              RELOAD PAGE
            </button>
          </div>
        </div>
      )}
      <StageErrorBoundary>
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50, near: 0.05, far: 5000 }}
        gl={{
          antialias:             true,
          alpha:                 false,
          preserveDrawingBuffer: true,
          toneMapping:           THREE.ACESFilmicToneMapping,
          toneMappingExposure:   0.62,
        }}
        shadows
      >
        <WebGLContextLossHandler
          onContextLost={handleContextLost}
          onContextRestored={handleContextRestored}
        />
        {glDomElementRef && <GlDomElementBridge targetRef={glDomElementRef} />}
        {/* ACES filmic tone mapping — hardcoded for cinema quality */}
        <PovClipGuard enabled={povMode} modelMetrics={modelMetrics} />
        <ToneMappingController />

        {/* Background — black in stealth mode, overridden by HDRI when visible */}
        <color attach="background" args={['#000000']} />
        <fog   attach="fog"        args={['#0a0a0c', 120, 600]} />

        {/* HDRI Environment — LITE & STABLE version
            customHdriUrl  → LiteHdriEnvironment (url_low only, no rotation)
            hdriPreset     → drei <Environment preset> (backward compat, small 1K files) */}
        <>
          {!hasEnv && (
            <LocalStudioEnvironment
              intensity={resolvedEnvInt}
              background={resolvedShowBg}
              bgBlur={resolvedBgBlur}
            />
          )}
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
                onLoadComplete={onHdriLoadComplete}
                loadingManager={loadingManager}
              />
            ) : (
              resolvedShowBg
                ? <Environment preset={hdriPreset} background backgroundBlurriness={resolvedBgBlur} />
                : <Environment preset={hdriPreset} />
            )}
            <EnvIntensityController intensity={resolvedEnvInt} protectLed={protectLed ?? true} />
          </>
          )}
        </>

        {/* Lighting
            ambientLight scales with sunIntensity so dragging sun to 0 kills
            all ambient fill as well — no residual glow when everything is off. */}
        <ambientLight intensity={sunIntensity * 0.08} />
        <hemisphereLight
          args={['#dbe5f3', '#040405', sunIntensity * 0.18]}
        />
        <directionalLight
          position={sunPosition}
          intensity={sunIntensity}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={100}
          shadow-camera-left={-35}
          shadow-camera-right={35}
          shadow-camera-top={35}
          shadow-camera-bottom={-35}
          shadow-bias={-0.0006}
          shadow-normalBias={0.045}
        />
        <directionalLight
          position={[-10, 8, -6]}
          intensity={sunIntensity * 0.16}
          color="#b9c8ff"
        />
        <directionalLight
          position={[8, 6, -12]}
          intensity={sunIntensity * 0.12}
          color="#ffe4bf"
        />

        {/* Placeholder cube — only shown before a model is loaded */}
        {!modelLoaded && (
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#8b5cf6" />
          </mesh>
        )}

        {/* Reflective helper floor is only useful before a real stage model exists. */}
        {!modelLoaded && <ReflectiveFloor />}
        <ContactShadows
          position={[0, -0.055, 0]}
          opacity={0.38}
          scale={90}
          blur={1.8}
          far={40}
          resolution={1024}
          frames={1}
        />

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

        {loadingManager && <FirstFrameReporter loadingManager={loadingManager} />}
        <Suspense fallback={null}>
          {modelUrl && (
            <Scene
              modelUrl={modelUrl}
              videoElement={videoElement}
              activeImageUrl={activeImageUrl}
              onLedMaterialStatus={onLedMaterialStatus}
              protectLed={protectLed ?? true}
              sunIntensity={sunIntensity ?? 1}
              envIntensity={envIntensity ?? 1}
              transparentLedConfig={transparentLedConfig}
              loadingManager={loadingManager}
              onImageTextureLoaded={onImageTextureLoaded}
              onModelMetrics={handleModelMetrics}
              onMeshScan={onMeshScanChange}
            />
          )}
        </Suspense>

        <CameraControls
          ref={cameraControlsRef}
          makeDefault
          smoothTime={0.5}
          dollySpeed={0.5}
          enabled={!povMode}
        />

        {cameraControlsRef && !povMode && (
          <CameraAutoFrame
            cameraControlsRef={cameraControlsRef}
            modelMetrics={modelMetrics}
            modelUrl={modelUrl}
            reframeKey={reframeKey}
          />
        )}

        {cameraControlsRef && !povMode && (
          <CameraSmoothFlyController
            cameraControlsRef={cameraControlsRef}
            targetPresetRef={presetRef}
            flyDurationSeconds={cameraFlyDurationSeconds}
          />
        )}

        {povMode && modelUrl && onPovExitRequest && (
          <PovRuntimeBoundary onError={handlePovRuntimeError} resetKey={modelUrl}>
            <Suspense fallback={null}>
              {povEvalAllowed == null ? null : povEvalAllowed ? (
                <LazyPovFpsRig
                  enabled={povMode}
                  floorY={povHeightOffset}
                  geofenceBox={modelMetrics?.box ?? null}
                  geofencePadding={povGeofencePadding}
                  stageColliders={stageColliders}
                  moveSpeed={povMoveSpeed}
                />
              ) : (
                <LazyPovSimpleRig
                  enabled={povMode}
                  floorY={povHeightOffset}
                  geofenceBox={modelMetrics?.box ?? null}
                  geofencePadding={povGeofencePadding}
                />
              )}
            </Suspense>
          </PovRuntimeBoundary>
        )}

        {/* Bloom + DoF — stage stays sharp, background/foreground bokeh */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={resolvedThreshold}
            luminanceSmoothing={0.9}
            intensity={resolvedBloom}
          />
          {resolvedBgBlur > 0 && (
            <DepthOfField
              target={[0, 1, 0]}
              worldFocusRange={6}
              focalLength={0.02}
              bokehScale={2}
            />
          )}
        </EffectComposer>
      </Canvas>
      </StageErrorBoundary>

      {children}
    </div>
  )
}

export default StageCanvas

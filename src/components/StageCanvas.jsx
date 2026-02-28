import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import { CameraControls, Sparkles, Grid, MeshReflectorMaterial, Environment } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
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

        {/* HDRI Environment
            showHdriBackground=true  → HDRI is visible background + lighting
            showHdriBackground=false → HDRI lights/reflects scene only, bg stays black */}
        {hasEnv && (
          <>
            {resolvedShowBg ? (
              customHdriUrl
                ? <Environment files={customHdriUrl} background backgroundBlurriness={resolvedBgBlur} />
                : <Environment preset={hdriPreset}   background backgroundBlurriness={resolvedBgBlur} />
            ) : (
              customHdriUrl
                ? <Environment files={customHdriUrl} />
                : <Environment preset={hdriPreset}   />
            )}
            <EnvIntensityController intensity={resolvedEnvInt} />
          </>
        )}

        {/* Lighting */}
        <ambientLight intensity={hasEnv ? 0.1 : 0.3} />
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
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />

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

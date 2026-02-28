import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, Sparkles, Grid } from '@react-three/drei'
import Scene from './Scene'

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

/**
 * Reusable 3D canvas shared across Admin, Collab, and Client views.
 * All Three.js logic lives here — no duplication across pages.
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
  children,
}) {
  return (
    <div className="w-full h-full relative bg-[#0a0a0c]">
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        shadows
      >
        <color attach="background" args={['#0a0a0c']} />
        <fog   attach="fog"        args={['#0a0a0c', 15, 60]} />

        {/* Lighting */}
        <ambientLight intensity={0.3} />
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

        {/* Shadow-catching floor — sits just below the grid so shadows render */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#0a0a0c" roughness={0.9} metalness={0.1} />
        </mesh>

        {/* Infinite grid — Grid's shader uses depthWrite:false so the floor
            and its shadows remain visible through the transparent cell gaps.
            fadeDistance + fadeStrength blend the grid smoothly into the fog
            which shares the exact same #0a0a0c as the Canvas background. */}
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
            />
          )}
        </Suspense>

        <CameraControls
          ref={cameraControlsRef}
          makeDefault
          smoothTime={0.5}
          dollySpeed={0.5}
        />
      </Canvas>

      {/* HTML overlays rendered on top of the WebGL canvas */}
      {children}
    </div>
  )
}

export default StageCanvas

import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { buildGeofenceWallSpecs } from './povGeofenceColliders'
import { splitColliderSpecsByRole } from './povColliderUtils'

function DebugBox({ position, halfExtents, color }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.9} />
    </mesh>
  )
}

export function PovDebugOverlay({ stageColliders = [], geofenceBox, geofencePadding = 0 }) {
  const { camera } = useThree()
  const { floors, blockers } = useMemo(
    () => splitColliderSpecsByRole(stageColliders),
    [stageColliders],
  )
  const walls = useMemo(
    () => buildGeofenceWallSpecs(geofenceBox, geofencePadding),
    [geofenceBox, geofencePadding],
  )

  return (
    <group name="pov-debug-overlay">
      {floors.map((s) => (
        <DebugBox
          key={`debug_floor_${s.id}`}
          position={s.position}
          halfExtents={s.halfExtents}
          color="#22c55e"
        />
      ))}
      {blockers.map((s) => (
        <DebugBox
          key={`debug_blocker_${s.id}`}
          position={s.position}
          halfExtents={s.halfExtents}
          color="#f59e0b"
        />
      ))}
      {walls.map((w, idx) => (
        <DebugBox
          key={`debug_wall_${idx}`}
          position={w.pos}
          halfExtents={w.args}
          color="#38bdf8"
        />
      ))}

      {/* Eye marker helps visualise FPS camera point while pointer-locking */}
      <mesh position={camera.position}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshBasicMaterial color="#f43f5e" />
      </mesh>
    </group>
  )
}


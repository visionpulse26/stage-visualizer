import * as THREE from 'three'

/**
 * Snapshot for restoring orbit after POV (drei CameraControls / yomotsu camera-controls).
 */
export function captureOrbitState(controls) {
  if (!controls?.camera) return null
  const target = new THREE.Vector3()
  if (typeof controls.getTarget === 'function') {
    controls.getTarget(target)
  } else {
    return null
  }
  return {
    position: controls.camera.position.clone(),
    target,
  }
}

function waitForControlsRest(controls, msFallback = 2000) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      controls.removeEventListener?.('rest', onRest)
      clearTimeout(tid)
      resolve()
    }
    const onRest = () => finish()
    controls.addEventListener?.('rest', onRest)
    const tid = window.setTimeout(finish, msFallback)
  })
}

/**
 * Animate camera to standing "audience" eye height (model is normalized: floor ≈ y=0).
 */
export async function enterPovMode(controls, modelMetrics, povHeightOffset) {
  if (!controls || !modelMetrics) return
  const { center, radius } = modelMetrics
  const eyeY = povHeightOffset
  const cx = center.x
  const cz = center.z
  const camZ = cz + radius * 0.6
  controls.setLookAt(cx, eyeY, camZ, cx, eyeY, cz, true)
  await waitForControlsRest(controls)
}

export async function restoreOrbitState(controls, saved) {
  if (!controls || !saved) return
  const { position, target } = saved
  controls.setLookAt(
    position.x,
    position.y,
    position.z,
    target.x,
    target.y,
    target.z,
    true,
  )
  await waitForControlsRest(controls)
}

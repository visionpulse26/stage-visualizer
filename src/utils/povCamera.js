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
export async function enterPovMode(controls, modelMetrics, povHeightOffset, { animate = true } = {}) {
  if (!controls || !modelMetrics) return
  const { center, radius } = modelMetrics
  const eyeY = povHeightOffset
  const currentPos = controls.camera?.position
  const currentTarget = new THREE.Vector3()
  const hasTarget = typeof controls.getTarget === 'function'

  if (currentPos && hasTarget) {
    controls.getTarget(currentTarget)
    const flatDir = new THREE.Vector3(
      currentTarget.x - currentPos.x,
      0,
      currentTarget.z - currentPos.z,
    )
    if (flatDir.lengthSq() > 1e-6) {
      flatDir.normalize()
      const lookDistance = Math.max(Math.min(radius * 0.2, 12), 4)
      controls.setLookAt(
        currentPos.x,
        eyeY,
        currentPos.z,
        currentPos.x + flatDir.x * lookDistance,
        eyeY,
        currentPos.z + flatDir.z * lookDistance,
        animate,
      )
    } else {
      controls.setLookAt(currentPos.x, eyeY, currentPos.z, center.x, eyeY, center.z, animate)
    }
  } else {
    const cx = center.x
    const cz = center.z
    const camZ = cz + radius * 0.6
    controls.setLookAt(cx, eyeY, camZ, cx, eyeY, cz, animate)
  }
  if (animate) {
    await waitForControlsRest(controls)
  } else {
    controls.update?.(0)
  }
}

export async function restoreOrbitState(controls, saved, { animate = false } = {}) {
  if (!controls || !saved) return
  const { position, target } = saved
  controls.setLookAt(
    position.x,
    position.y,
    position.z,
    target.x,
    target.y,
    target.z,
    animate,
  )
  if (animate) {
    await waitForControlsRest(controls)
  } else {
    controls.update?.(0)
  }
}

/**
 * Reattach yomotsu camera-controls to the WebGL canvas after POV `disconnect()`.
 * Calling `connect()` without a DOM element does not restore pointer / wheel listeners.
 */
export function reconnectOrbitControls(controls, canvasDom) {
  if (!controls?.connect || !controls?.disconnect) return
  controls.enabled = true
  if (!canvasDom) return
  try {
    controls.disconnect()
  } catch {
    /* noop */
  }
  controls.connect(canvasDom)
}

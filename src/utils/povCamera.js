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

function waitForControlsRest(controls, { msFallback = 2000, signal } = {}) {
  return new Promise((resolve, reject) => {
    let done = false
    let tid = null
    const finish = () => {
      if (done) return
      done = true
      controls.removeEventListener?.('rest', onRest)
      signal?.removeEventListener?.('abort', onAbort)
      clearTimeout(tid)
      resolve()
    }
    const abort = () => {
      if (done) return
      done = true
      controls.removeEventListener?.('rest', onRest)
      clearTimeout(tid)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const onRest = () => finish()
    const onAbort = () => abort()
    if (signal?.aborted) {
      abort()
      return
    }
    controls.addEventListener?.('rest', onRest)
    signal?.addEventListener?.('abort', onAbort, { once: true })
    tid = window.setTimeout(finish, msFallback)
  })
}

/**
 * Animate camera to standing "audience" eye height (model is normalized: floor ≈ y=0).
 */
export async function enterPovMode(controls, modelMetrics, povHeightOffset, { animate = true, signal } = {}) {
  if (!controls || !modelMetrics) return
  const { center, radius } = modelMetrics
  const eyeY = povHeightOffset
  const cx = center.x
  const cz = center.z
  const camZ = cz + radius * 0.6
  controls.setLookAt(cx, eyeY, camZ, cx, eyeY, cz, animate)
  if (animate) {
    await waitForControlsRest(controls, { signal })
  } else {
    controls.update?.(0)
  }
}

export async function restoreOrbitState(controls, saved, { animate = false, signal } = {}) {
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
    await waitForControlsRest(controls, { signal })
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

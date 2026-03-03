/**
 * Native Three.js camera preset movement — instant, no GSAP.
 * Uses camera-controls setLookAt with enableTransition: false.
 */
export function moveCameraToPreset(controlsRef, targetCam) {
  const controls = controlsRef?.current
  if (!controls) return

  if (!targetCam || !targetCam.position || !targetCam.target) return

  const px = targetCam.position.x
  const py = targetCam.position.y
  const pz = targetCam.position.z
  const tx = targetCam.target.x
  const ty = targetCam.target.y
  const tz = targetCam.target.z

  // Instant jump — enableTransition: false
  if (typeof controls.setLookAt === 'function') {
    controls.setLookAt(px, py, pz, tx, ty, tz, false)
  } else {
    // Fallback: set camera position and target directly
    const camera = controls.camera
    if (camera) {
      camera.position.set(px, py, pz)
      controls.setTarget?.(tx, ty, tz, false)
    }
  }

  if (typeof controls.update === 'function') {
    controls.update(0)
  }
}

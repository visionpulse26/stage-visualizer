import gsap from 'gsap'
import * as THREE from 'three'

const ANIM_DURATION = 2.5
const EASE = 'power3.inOut'

/**
 * Bulletproof GSAP camera transition. Do NOT disable controls.
 * Uses target proxy + setTarget since camera-controls may not expose .target.
 */
export function animateCameraToPreset(controlsRef, targetCam, options = {}) {
  const controls = controlsRef?.current
  if (!controls) return

  if (!targetCam || !targetCam.position || !targetCam.target) return

  const camera = controls.camera
  if (!camera) return

  const duration = options.duration ?? ANIM_DURATION
  const ease = options.ease ?? EASE

  gsap.killTweensOf([camera.position])

  const targetProxy = new THREE.Vector3()
  controls.getTarget(targetProxy)

  gsap.killTweensOf([targetProxy])

  gsap.to(camera.position, {
    x: targetCam.position.x,
    y: targetCam.position.y,
    z: targetCam.position.z,
    duration,
    ease,
  })

  gsap.to(targetProxy, {
    x: targetCam.target.x,
    y: targetCam.target.y,
    z: targetCam.target.z,
    duration,
    ease,
    onUpdate: () => {
      controls.setTarget(targetProxy.x, targetProxy.y, targetProxy.z, false)
      if (typeof controls.update === 'function') controls.update(0)
    },
  })
}

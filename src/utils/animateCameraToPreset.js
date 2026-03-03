import gsap from 'gsap'
import * as THREE from 'three'

const DURATION = 3
const EASE = 'power2.inOut'

/**
 * Animate camera position and target to a preset using GSAP.
 * Disables controls during animation to avoid conflicts, then syncs and re-enables.
 */
export function animateCameraToPreset(controlsRef, preset, options = {}) {
  const controls = controlsRef?.current
  if (!controls) return

  const camera = controls.camera
  if (!camera) return

  const duration = options.duration ?? DURATION
  const ease = options.ease ?? EASE

  const pos = new THREE.Vector3()
  const tgt = new THREE.Vector3()
  controls.getPosition(pos, false)
  controls.getTarget(tgt, false)

  gsap.killTweensOf([camera.position, tgt])
  controls.enabled = false

  gsap.to(camera.position, {
    x: preset.position.x,
    y: preset.position.y,
    z: preset.position.z,
    duration,
    ease,
  })

  gsap.to(tgt, {
    x: preset.target.x,
    y: preset.target.y,
    z: preset.target.z,
    duration,
    ease,
    onUpdate: () => {
      camera.lookAt(tgt.x, tgt.y, tgt.z)
      if (controls.update) controls.update(0)
    },
    onComplete: () => {
      controls.setLookAt(
        preset.position.x, preset.position.y, preset.position.z,
        preset.target.x, preset.target.y, preset.target.z,
        false
      )
      controls.enabled = true
    },
  })
}

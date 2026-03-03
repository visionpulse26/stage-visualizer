/**
 * Camera preset target setter — smooth fly is driven by CameraSmoothFlyController in useFrame.
 * Call this when a preset is selected (manual click or Autoplay tick).
 */
export function setCameraTargetPreset(targetPresetRef, preset) {
  if (!targetPresetRef) return
  if (!preset || !preset.position || !preset.target) return
  targetPresetRef.current = preset
}

export function shouldApplyStepAssist({
  wantsMove,
  grounded,
  verticalVelocity,
  obstacleHeight,
  maxStepHeight,
}) {
  if (!wantsMove || !grounded) return false
  if (Math.abs(verticalVelocity) > 0.35) return false
  if (obstacleHeight <= 0) return false
  return obstacleHeight <= maxStepHeight
}


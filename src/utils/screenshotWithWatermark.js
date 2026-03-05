/**
 * Captures the WebGL canvas and composites the TOO:AWAKE watermark in the bottom-right.
 * @param {HTMLCanvasElement} canvas - The Three.js/WebGL canvas
 * @param {string} projectName - Project name for watermark (default: "LIVE STAGE")
 * @returns {string} Data URL of the image with watermark
 */
export function captureScreenshotWithWatermark(canvas, projectName = 'LIVE STAGE') {
  const displayName = (projectName || '').trim() || 'LIVE STAGE'
  const watermarkText = `${displayName} | VISUALIZED BY TOO:AWAKE`

  const w = canvas.width
  const h = canvas.height
  const offscreen = document.createElement('canvas')
  offscreen.width = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')

  ctx.drawImage(canvas, 0, 0)
  ctx.font = '700 13px "Chakra Petch", sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  const padding = 20
  const x = w - padding
  const y = h - padding

  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1
  ctx.fillStyle = '#FF5F1F'
  ctx.fillText(watermarkText.toUpperCase(), x, y)
  ctx.shadowBlur = 0

  return offscreen.toDataURL('image/png')
}

/**
 * Captures the WebGL canvas and composites:
 * - Status Notch at top-center (if versionStatus is set)
 * - TOO:AWAKE watermark at bottom-right
 * @param {HTMLCanvasElement} canvas - The Three.js/WebGL canvas
 * @param {string} projectName - Project name for watermark (default: "LIVE STAGE")
 * @param {string} versionStatus - Status text for the top Notch (e.g. "Ver 1")
 * @returns {string} Data URL of the image with watermarks
 */
export function captureScreenshotWithWatermark(canvas, projectName = 'LIVE STAGE', versionStatus = '') {
  const displayName = (projectName || '').trim() || 'LIVE STAGE'
  const watermarkText = `${displayName} | VISUALIZED BY TOO:AWAKE`
  const notchText = (versionStatus || '').trim()

  const w = canvas.width
  const h = canvas.height
  const offscreen = document.createElement('canvas')
  offscreen.width = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')

  ctx.drawImage(canvas, 0, 0)

  // Draw Status Notch at top-center (if status is set)
  if (notchText) {
    ctx.font = '700 12px "Chakra Petch", sans-serif'
    const textMetrics = ctx.measureText(notchText.toUpperCase())
    const notchPadH = 24
    const notchPadV = 10
    const notchW = Math.max(textMetrics.width + notchPadH * 2, 80)
    const notchH = 36
    const radius = 10
    const cx = w / 2
    const left = cx - notchW / 2
    const top = 0

    // Rounded rect: only bottom-left and bottom-right corners
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(left, top + notchH - radius)
    ctx.arcTo(left, top + notchH, left + radius, top + notchH, radius)
    ctx.lineTo(left + notchW - radius, top + notchH)
    ctx.arcTo(left + notchW, top + notchH, left + notchW, top + notchH - radius, radius)
    ctx.lineTo(left + notchW, top)
    ctx.lineTo(left, top)
    ctx.closePath()
    ctx.fillStyle = '#FF5F1F'
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.fill()
    ctx.shadowBlur = 0

    ctx.fillStyle = '#000000'
    ctx.font = '700 12px "Chakra Petch", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(notchText.toUpperCase(), cx, top + notchH / 2)
  }

  // Draw footer watermark at bottom-right
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

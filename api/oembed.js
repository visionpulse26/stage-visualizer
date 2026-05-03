/**
 * Vercel Serverless: GET /api/oembed
 *
 * oEmbed provider endpoint for stage.tooawake.mov/embed/* URLs.
 * Allows Canva (and other oEmbed consumers) to embed stage previews as rich iframes.
 *
 * Spec: https://oembed.com/#section2
 *
 * Example:
 *   GET /api/oembed?url=https://stage.tooawake.mov/embed/abc123&maxwidth=1280&maxheight=720
 */

const PROVIDER_NAME = 'TOO:AWAKE Stage Visualizer'
const PROVIDER_URL  = 'https://stage.tooawake.mov'
const ALLOWED_HOST  = 'stage.tooawake.mov'
const DEFAULT_WIDTH  = 1280
const DEFAULT_HEIGHT = 720

/**
 * Validate that the requested URL belongs to this provider's embed path.
 * Returns the parsed URL object or null if invalid/unsupported.
 */
function parseEmbedUrl(raw) {
  if (!raw) return null
  try {
    const u = new URL(decodeURIComponent(raw))
    if (u.hostname !== ALLOWED_HOST) return null
    if (!u.pathname.startsWith('/embed/')) return null
    const embedSlug = u.pathname.replace('/embed/', '').split('/')[0]
    if (!embedSlug) return null
    return { url: u, embedSlug }
  } catch {
    return null
  }
}

export default function handler(req, res) {
  // oEmbed is always GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CORS — oEmbed consumers (Canva, Notion, etc.) fetch from browser
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url, maxwidth, maxheight, format } = req.query

  // oEmbed spec: only JSON format supported; 501 for xml
  if (format && format !== 'json') {
    return res.status(501).json({ error: 'Only JSON format is supported' })
  }

  const parsed = parseEmbedUrl(url)
  if (!parsed) {
    return res.status(404).json({ error: 'URL not found or not supported by this provider' })
  }

  const width  = Math.min(parseInt(maxwidth,  10) || DEFAULT_WIDTH,  DEFAULT_WIDTH)
  const height = Math.min(parseInt(maxheight, 10) || DEFAULT_HEIGHT, DEFAULT_HEIGHT)

  const embedSrc = `${PROVIDER_URL}/embed/${parsed.embedSlug}`

  const iframeHtml =
    `<iframe` +
    ` src="${embedSrc}"` +
    ` width="${width}"` +
    ` height="${height}"` +
    ` frameborder="0"` +
    ` allow="fullscreen"` +
    ` style="border-radius:8px;background:#0a0a0a"` +
    `></iframe>`

  const response = {
    version:       '1.0',
    type:          'rich',
    provider_name: PROVIDER_NAME,
    provider_url:  PROVIDER_URL,
    title:         `Stage Preview — ${parsed.embedSlug}`,
    width,
    height,
    html:          iframeHtml,
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).json(response)
}

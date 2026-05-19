/**
 * Vercel Serverless: GET /api/oembed
 *
 * oEmbed provider endpoint for stage.tooawake.mov/embed/* URLs.
 * Allows Canva and other oEmbed consumers to embed stage previews as rich iframes.
 *
 * Spec: https://oembed.com/#section2
 */

const PROVIDER_NAME = 'TOO:AWAKE Stage Visualizer'
const PROVIDER_URL = 'https://stage.tooawake.mov'
const ALLOWED_HOST = 'stage.tooawake.mov'
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 720
const EMBED_SLUG_RE = /^[A-Za-z0-9_-]{8,128}$/

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function boundedDimension(value, fallback, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(parsed, max))
}

/**
 * Validate that the requested URL belongs to this provider's embed path.
 * Vercel already decodes req.query values, so do not decode a second time.
 */
function parseEmbedUrl(raw) {
  if (!raw) return null
  try {
    const u = new URL(String(raw))
    if (u.hostname !== ALLOWED_HOST) return null
    if (u.username || u.password) return null
    if (!u.pathname.startsWith('/embed/')) return null

    const embedSlug = u.pathname.slice('/embed/'.length).split('/')[0]
    if (!EMBED_SLUG_RE.test(embedSlug)) return null

    return { url: u, embedSlug }
  } catch {
    return null
  }
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url, maxwidth, maxheight, format } = req.query

  if (format && format !== 'json') {
    return res.status(501).json({ error: 'Only JSON format is supported' })
  }

  const parsed = parseEmbedUrl(url)
  if (!parsed) {
    return res.status(404).json({ error: 'URL not found or not supported by this provider' })
  }

  const width = boundedDimension(maxwidth, DEFAULT_WIDTH, DEFAULT_WIDTH)
  const height = boundedDimension(maxheight, DEFAULT_HEIGHT, DEFAULT_HEIGHT)
  const embedSrc = `${PROVIDER_URL}/embed/${encodeURIComponent(parsed.embedSlug)}`

  const iframeHtml =
    `<iframe` +
    ` src="${escapeHtml(embedSrc)}"` +
    ` width="${escapeHtml(width)}"` +
    ` height="${escapeHtml(height)}"` +
    ` frameborder="0"` +
    ` allow="fullscreen"` +
    ` style="border-radius:8px;background:#0a0a0a"` +
    `></iframe>`

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).json({
    version: '1.0',
    type: 'rich',
    provider_name: PROVIDER_NAME,
    provider_url: PROVIDER_URL,
    title: 'Stage Preview',
    width,
    height,
    html: iframeHtml,
  })
}

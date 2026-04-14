import { Link } from 'react-router-dom'

/**
 * Global footer watermark — used across Admin, Collab, Client.
 * {projectName} | VISUALIZED BY TOO:AWAKE
 */
function GlobalFooter({ projectName = 'LIVE STAGE' }) {
  const displayName = projectName?.trim() || 'LIVE STAGE'
  const text = `${displayName} | VISUALIZED BY TOO:AWAKE`

  return (
    <>
      <div
        className="global-footer-watermark"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9999,
          fontFamily: "'Chakra Petch', sans-serif",
          fontWeight: 700,
          fontSize: '13px',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: '#FF5F1F',
          textShadow: '0 0 4px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9), 0 0 12px rgba(255,95,31,0.3)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {text}
      </div>
      <Link
        to="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-2 left-3 z-[9998] text-[9px] text-white/15 hover:text-white/30 transition-colors pointer-events-auto"
        style={{ fontFamily: "'Chakra Petch', sans-serif", letterSpacing: '0.05em' }}
      >
        Privacy
      </Link>
    </>
  )
}

export default GlobalFooter

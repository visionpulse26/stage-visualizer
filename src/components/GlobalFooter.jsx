/**
 * Global footer watermark — used across Admin, Collab, Client.
 * {projectName} | VISUALIZED BY TOO:AWAKE
 */
function GlobalFooter({ projectName = 'LIVE STAGE' }) {
  const displayName = projectName?.trim() || 'LIVE STAGE'
  const text = `${displayName} | VISUALIZED BY TOO:AWAKE`

  return (
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
  )
}

export default GlobalFooter

/**
 * Dynamic "Notch" (Tai thỏ) at top-center — displays version status from Admin.
 * Styling: #FF5F1F bg, #000000 text, Chakra Petch Bold Uppercase.
 */
function Notch({ status = '' }) {
  const text = (status || '').trim() || ''
  if (!text) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        backgroundColor: '#FF5F1F',
        color: '#000000',
        fontFamily: "'Chakra Petch', sans-serif",
        fontWeight: 700,
        textTransform: 'uppercase',
        fontSize: '12px',
        letterSpacing: '0.1em',
        padding: '8px 24px 12px',
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {text}
    </div>
  )
}

export default Notch

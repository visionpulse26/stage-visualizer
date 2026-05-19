// Top-bar + controls for admin Annotation Mode (shown while editing a note's annotation).

const T = {
  glass:     'rgba(255,255,255,0.045)',
  border:    'rgba(220,100,30,0.20)',
  ember:     '#E8531A',
  ember2:    '#FF6B2B',
  emberGlow: '0 0 14px rgba(232,83,26,0.45), 0 0 2px rgba(232,83,26,0.8)',
  cam:       '#1FA0EE',
  text:      '#F4ECE2',
  text2:     '#C8B8A8',
  text3:     '#8E7E70',
  text4:     '#5A4E45',
}

/**
 * Top bar shown during admin annotation mode.
 *
 * @param {{
 *   noteIndex: number,
 *   slideTitle: string,
 *   camName: string,
 *   clipTime: number|null,
 *   onSave: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function AnnotationModeTopBar({ noteIndex, slideTitle, camName, clipTime, onSave, onCancel }) {
  function fmtTime(s) {
    if (s == null) return ''
    const m = Math.floor(s / 60)
    const sec = String(Math.floor(s % 60)).padStart(2, '0')
    return ` · ${String(m).padStart(2, '0')}:${sec}`
  }

  return (
    <div style={{
      height: 44, background: 'rgba(25,8,3,0.97)',
      borderBottom: `1px solid rgba(232,83,26,0.45)`,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
      flexShrink: 0, backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{
        width: 24, height: 24, borderRadius: 5,
        background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'white',
        boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
        flexShrink: 0,
      }}>SV</div>

      <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>
        Annotation Mode
      </span>

      <div style={{ width: 1, height: 22, background: 'rgba(232,83,26,0.3)' }} />

      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600,
        background: 'rgba(232,83,26,0.16)', border: `1px solid ${T.ember}`,
        color: T.ember2, fontFamily: 'Chakra Petch, sans-serif',
        boxShadow: T.emberGlow,
      }}>
        🔒 Camera Locked · Center
      </span>

      {slideTitle && (
        <span style={{
          background: 'rgba(232,83,26,0.1)', border: `1px solid rgba(232,83,26,0.3)`,
          borderRadius: 5, padding: '3px 10px',
          fontSize: 10, color: T.ember2, fontWeight: 500,
          fontFamily: 'Chakra Petch, sans-serif',
        }}>
          {slideTitle} · Note {noteIndex + 1}{camName ? ` · ${camName}` : ''}{fmtTime(clipTime)}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <button onClick={onCancel} style={{
        padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 500,
        background: T.glass, border: `1px solid ${T.border}`, color: T.text2,
      }}>
        ✕ Cancel
      </button>

      <button onClick={onSave} style={{
        padding: '5px 13px', borderRadius: 6, cursor: 'pointer',
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 600,
        background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
        border: `1px solid ${T.ember2}`, color: 'white',
        boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
      }}>
        ✓ Save annotation
      </button>
    </div>
  )
}

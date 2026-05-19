import { useState, useRef } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, PenLine, Trash2, X } from 'lucide-react'

const T = {
  glass:     'rgba(255,255,255,0.045)',
  border:    'rgba(220,100,30,0.20)',
  border2:   'rgba(220,100,30,0.32)',
  ember:     '#E8531A',
  ember2:    '#FF6B2B',
  emberDim:  'rgba(232,83,26,0.12)',
  cam:       '#1FA0EE',
  green:     '#2BC782',
  amber:     '#E89518',
  text:      '#F4ECE2',
  text2:     '#C8B8A8',
  text3:     '#8E7E70',
  text4:     '#5A4E45',
}

const Row = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap, ...style }}>{children}</div>
)
const Col = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
)

function fmtTime(s) {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return `${String(m).padStart(2, '0')}:${sec}`
}

function AnnotationPreview({ annotation }) {
  if (!annotation) return null
  return (
    <div style={{
      width: 42, height: 28,
      background: 'rgba(20,6,2,0.7)',
      border: `1px solid rgba(232,83,26,0.3)`,
      borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {annotation.type === 'circle' ? (
        <svg width="32" height="22" viewBox="0 0 32 22">
          <ellipse cx="16" cy="11" rx="12" ry="7" stroke={T.ember} strokeWidth="1.5" fill="none" strokeDasharray="3 2" />
        </svg>
      ) : (
        <svg width="32" height="22" viewBox="0 0 32 22">
          <rect x="3" y="3" width="26" height="16" stroke={T.ember} strokeWidth="1.5" fill="none" strokeDasharray="3 2" />
        </svg>
      )}
    </div>
  )
}

/**
 * Single director note row in the admin editor.
 *
 * @param {{
 *   note: import('../../../lib/presentationVersions').DirectorNote,
 *   index: number,
 *   total: number,
 *   cameraPresets: import('../../../lib/presentationVersions').CameraPreset[],
 *   hasCenterPreset: boolean,
 *   onChange: (patch: Partial<import('../../../lib/presentationVersions').DirectorNote>) => void,
 *   onMoveUp: () => void,
 *   onMoveDown: () => void,
 *   onDelete: () => void,
 *   onEditAnnotation: () => void,
 *   onRemoveAnnotation: () => void,
 * }} props
 */
export function DirectorNoteRow({
  note,
  index,
  total,
  cameraPresets,
  hasCenterPreset,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  onEditAnnotation,
  onRemoveAnnotation,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const textRef = useRef(null)
  const focusTextRef = useRef(note.text ?? '')

  const camName = cameraPresets.find(p => p.id === note.cameraPresetId)?.name ?? ''

  function handleDeleteClick() {
    if (note.annotation) {
      setConfirmDelete(true)
    } else {
      onDelete()
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.045)',
      borderRadius: 6,
      padding: '8px 9px',
    }}>
      {/* Note header */}
      <Row gap={6} style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
          Note {index + 1}
        </span>
        {note.annotation && (
          <span style={{
            fontSize: 8, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: T.ember2, fontFamily: 'Chakra Petch, sans-serif',
            background: T.emberDim, border: `1px solid rgba(232,83,26,0.25)`,
            borderRadius: 3, padding: '1px 5px',
          }}>
            annotated
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => onChange({ visibleToClient: !note.visibleToClient })}
          title={note.visibleToClient ? 'Visible to client' : 'Hidden from client'}
          style={iconBtnStyle(true, false, note.visibleToClient)}
        >
          {note.visibleToClient ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button disabled={index === 0} onClick={onMoveUp} style={iconBtnStyle(index !== 0)} title="Move up"><ArrowUp size={12} /></button>
        <button disabled={index === total - 1} onClick={onMoveDown} style={iconBtnStyle(index !== total - 1)} title="Move down"><ArrowDown size={12} /></button>
        <button onClick={handleDeleteClick} style={iconBtnStyle(true, true)} title="Delete note"><Trash2 size={12} /></button>
      </Row>

      {/* Text */}
      <textarea
        ref={textRef}
        value={note.text}
        onFocus={() => { focusTextRef.current = note.text ?? '' }}
        onChange={e => onChange({ text: e.target.value })}
        onBlur={e => {
          if (e.target.value !== focusTextRef.current) {
            onChange({ updatedAt: new Date().toISOString() })
          }
        }}
        placeholder="Write a director's note…"
        rows={3}
        style={{
          width: '100%', background: 'rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 6, padding: '7px 8px',
          fontFamily: 'Inter, Roboto, system-ui, sans-serif', fontSize: 11,
          color: T.text, outline: 'none', lineHeight: 1.5, resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      {/* Annotation section */}
      <Col gap={5} style={{ marginTop: 7 }}>
        {note.annotation ? (
          <Row gap={8} style={{
            background: 'rgba(232,83,26,0.06)',
            borderRadius: 6, padding: '6px 7px',
          }}>
            <AnnotationPreview annotation={note.annotation} />
            <Col gap={2} style={{ flex: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>
                {note.annotation.type === 'circle' ? 'Circle' : 'Region'} annotation
              </span>
              <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                {camName ? `cam: ${camName}` : ''}
                {note.clipTimeSeconds != null ? ` - @ ${fmtTime(note.clipTimeSeconds)}` : ''}
              </span>
            </Col>
            <Col gap={4}>
              <button
                onClick={onEditAnnotation}
                disabled={!hasCenterPreset}
                title={hasCenterPreset ? 'Edit annotation' : 'Add a Center camera preset first'}
                style={actionBtnStyle(hasCenterPreset)}
              >
                <PenLine size={11} /> Edit
              </button>
              <button onClick={onRemoveAnnotation} style={actionBtnStyle(true, true)}>
                <X size={11} /> Remove
              </button>
            </Col>
          </Row>
        ) : (
          <button
            onClick={onEditAnnotation}
            disabled={!hasCenterPreset}
            title={hasCenterPreset ? 'Draw annotation on stage' : 'Add a Center camera preset first'}
            style={{
              ...actionBtnStyle(hasCenterPreset),
              width: '100%', justifyContent: 'center', padding: '5px',
              fontSize: 10,
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            {hasCenterPreset ? <><PenLine size={11} /> Draw annotation</> : 'Center preset required for annotation'}
          </button>
        )}
      </Col>

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{
          marginTop: 8, padding: '8px 10px',
          background: 'rgba(232,83,26,0.08)', border: `1px solid rgba(232,83,26,0.25)`,
          borderRadius: 6,
        }}>
          <span style={{ fontSize: 10, color: T.text2, fontFamily: 'Chakra Petch, sans-serif', display: 'block', marginBottom: 6 }}>
            This note has an annotation. Delete both?
          </span>
          <Row gap={6}>
            <button onClick={() => { onDelete(); setConfirmDelete(false) }} style={actionBtnStyle(true, true)}>Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={actionBtnStyle(true)}>Cancel</button>
          </Row>
        </div>
      )}
    </div>
  )
}

function iconBtnStyle(enabled, danger = false, active = false) {
  return {
    width: 24, height: 22, borderRadius: 5, fontSize: 11,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Inter, Roboto, system-ui, sans-serif', fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: active ? 'rgba(43,199,130,0.10)' : danger ? 'rgba(232,83,26,0.08)' : 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(255,255,255,0.075)',
    color: enabled ? (active ? T.green : danger ? T.ember2 : T.text3) : T.text4,
    opacity: enabled ? 1 : 0.45,
  }
}

function actionBtnStyle(enabled, danger = false) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 5, fontSize: 9,
    fontFamily: 'Inter, Roboto, system-ui, sans-serif', fontWeight: 650,
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: danger ? 'rgba(232,83,26,0.09)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${danger ? 'rgba(232,83,26,0.3)' : 'rgba(255,255,255,0.1)'}`,
    color: enabled ? (danger ? T.ember2 : T.text2) : T.text4,
    opacity: enabled ? 1 : 0.5,
  }
}

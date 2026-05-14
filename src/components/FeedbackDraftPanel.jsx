import { useState, useRef, useEffect, useCallback } from 'react'

// ── Design tokens (mirror ClientPage) ────────────────────────────────────────
const T = {
  bg:        '#080604',
  glass:     'rgba(255,255,255,0.045)',
  glass2:    'rgba(255,255,255,0.07)',
  glassDark: 'rgba(8,6,4,0.75)',
  border:    'rgba(220,100,30,0.20)',
  border2:   'rgba(220,100,30,0.32)',
  ember:     '#E8531A',
  ember2:    '#FF6B2B',
  emberDim:  'rgba(232,83,26,0.15)',
  emberGlow: '0 0 14px rgba(232,83,26,0.45), 0 0 2px rgba(232,83,26,0.8)',
  cam:       '#1FA0EE',
  camDim:    'rgba(31,160,238,0.15)',
  green:     '#2BC782',
  amber:     '#E89518',
  text:      '#F4ECE2',
  text2:     '#C8B8A8',
  text3:     '#8E7E70',
  text4:     '#5A4E45',
}

const Row = ({ children, gap = 6, align = 'center', style = {} }) => (
  <div style={{ display: 'flex', alignItems: align, gap, ...style }}>{children}</div>
)
const Col = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
)
const SLabel = ({ children, style = {} }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3, fontFamily: 'Chakra Petch, sans-serif', ...style }}>{children}</span>
)
const Divider = () => <div style={{ height: 1, background: 'rgba(220,100,30,0.12)' }} />

function Avatar({ name = '', size = 20 }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #B04018, #4A2010)',
      border: '1px solid rgba(232,83,26,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.ember2, fontSize: Math.max(7, size * 0.38), fontWeight: 700,
      fontFamily: 'Chakra Petch, sans-serif',
    }}>{initials}</div>
  )
}

function StatusTag({ type, children }) {
  const map = {
    pending:  { bg: 'rgba(232,149,24,0.12)',  border: 'rgba(232,149,24,0.55)', color: T.amber },
    resolved: { bg: 'rgba(43,199,130,0.10)',  border: 'rgba(43,199,130,0.45)', color: T.green },
  }
  const c = map[type] ?? map.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 4,
      fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
      fontFamily: 'Chakra Petch, sans-serif',
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
    }}>{children}</span>
  )
}

function PrevFeedbackItem({ item, onUpdate, onDelete, isBusy }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftComment, setDraftComment] = useState(item.comment ?? '')

  useEffect(() => {
    if (!isEditing) setDraftComment(item.comment ?? '')
  }, [isEditing, item.comment])

  function timeAgo(ts) {
    if (!ts) return ''
    const d = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
    if (d < 60) return `${d}m ago`
    if (d < 1440) return `${Math.floor(d / 60)}h ago`
    return `${Math.floor(d / 1440)}d ago`
  }

  const canSave = draftComment.trim().length > 0 && draftComment.trim() !== (item.comment ?? '').trim() && !isBusy

  return (
    <div style={{
      background: 'rgba(0,0,0,0.24)', border: `1px solid rgba(220,100,30,0.1)`,
      borderRadius: 7, padding: '7px 9px',
    }}>
      <Row gap={6} style={{ marginBottom: 4 }}>
        <Avatar name={item.reviewer_name} size={18} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>
          {item.reviewer_name || 'Reviewer'}
        </span>
        <StatusTag type={item.status}>{item.status}</StatusTag>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>{timeAgo(item.created_at)}</span>
      </Row>
      {isEditing ? (
        <Col gap={6} style={{ paddingLeft: 24 }}>
          <textarea
            value={draftComment}
            onChange={e => setDraftComment(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.35)',
              border: `1px solid ${draftComment.trim() ? 'rgba(220,100,30,0.22)' : 'rgba(232,83,26,0.5)'}`,
              borderRadius: 6,
              padding: '7px 9px',
              fontFamily: 'Chakra Petch, sans-serif',
              fontSize: 11,
              lineHeight: 1.5,
              color: T.text,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <Row gap={6}>
            <button
              onClick={() => onUpdate(item, { comment: draftComment.trim() }).then(() => setIsEditing(false))}
              disabled={!canSave}
              style={miniBtnStyle(canSave)}
            >
              Save
            </button>
            <button
              onClick={() => { setDraftComment(item.comment ?? ''); setIsEditing(false) }}
              disabled={isBusy}
              style={miniBtnStyle(true)}
            >
              Cancel
            </button>
          </Row>
        </Col>
      ) : (
        <span style={{ fontSize: 11, color: T.text2, display: 'block', paddingLeft: 24, lineHeight: 1.5, fontFamily: 'Chakra Petch, sans-serif' }}>
          {item.comment}
        </span>
      )}
      {(item.camera_snapshot_json?.name || item.clip_time_seconds != null) && (
        <Row gap={5} style={{ marginTop: 4, paddingLeft: 24 }}>
          <div style={{
            background: T.camDim, border: '1px solid rgba(31,160,238,0.3)',
            borderRadius: 4, padding: '1px 6px', fontSize: 9, color: T.cam, fontWeight: 500,
            fontFamily: 'Chakra Petch, sans-serif',
          }}>
            {item.camera_snapshot_json?.name ?? ''}
            {item.clip_time_seconds != null && ` · ${fmtTime(item.clip_time_seconds)}`}
          </div>
        </Row>
      )}
      {!isEditing && (
        <Row gap={6} style={{ marginTop: 6, paddingLeft: 24 }}>
          <button onClick={() => setIsEditing(true)} disabled={isBusy} style={miniBtnStyle(true)}>Edit</button>
          <button onClick={() => onDelete(item)} disabled={isBusy} style={miniBtnStyle(true, true)}>Delete</button>
        </Row>
      )}
    </div>
  )
}

// ── Feedback Draft Panel ──────────────────────────────────────────────────────
export function FeedbackDraftPanel({
  lockedCtx,           // { slideTitle, camName, clipTime, versionLabel }
  reviewerName,
  reviewerNameLocked = false,
  comment,
  annotation,          // null | { type, bounds }
  onRemoveAnnotation,
  prevFeedback,        // FeedbackItem[]
  onUpdatePrevFeedback,
  onDeletePrevFeedback,
  onCancel,
  onSubmit,
  isSubmitting,
  submitError,
}) {
  const [draftReviewerName, setDraftReviewerName] = useState(reviewerName)
  const [draftComment, setDraftComment] = useState(comment)
  const [busyFeedbackId, setBusyFeedbackId] = useState(null)

  useEffect(() => {
    setDraftReviewerName(reviewerName)
  }, [reviewerName])

  useEffect(() => {
    setDraftComment(comment)
  }, [comment])

  const canSubmit = draftReviewerName.trim().length > 0 && draftComment.trim().length > 0 && !isSubmitting

  const contextLine = [
    lockedCtx?.slideTitle,
    lockedCtx?.camName,
    lockedCtx?.clipTime != null ? fmtTime(lockedCtx.clipTime) : null,
    lockedCtx?.versionLabel,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      width: 320, flexShrink: 0,
      background: T.glassDark, backdropFilter: 'blur(14px)',
      borderLeft: `2px solid rgba(232,83,26,0.45)`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid rgba(232,83,26,0.2)`,
        background: 'rgba(20,6,2,0.55)', flexShrink: 0,
      }}>
        <Row gap={8} style={{ marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.ember, boxShadow: T.emberGlow, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>
            Feedback Draft
          </span>
        </Row>
        {contextLine && (
          <span style={{ fontSize: 10, color: T.text2, display: 'block', paddingLeft: 16, fontFamily: 'Chakra Petch, sans-serif', lineHeight: 1.4 }}>
            {contextLine}
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <Col gap={12}>

          {/* Reviewer name */}
          <Col gap={5}>
            <Row gap={5}>
              <SLabel>Your Name</SLabel>
              <span style={{ color: T.ember2, fontSize: 10 }}>*</span>
              {!draftReviewerName.trim() && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>required</span>
              )}
              {reviewerNameLocked && draftReviewerName.trim() && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: T.green, fontFamily: 'Chakra Petch, sans-serif' }}>locked</span>
              )}
            </Row>
            <DraftInput
              value={draftReviewerName}
              onChange={setDraftReviewerName}
              placeholder="Your name…"
              hasError={!draftReviewerName.trim()}
              disabled={reviewerNameLocked}
            />
            {reviewerNameLocked && (
              <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                Reviewer name is fixed for this presentation link.
              </span>
            )}
          </Col>

          {/* Comment */}
          <Col gap={5}>
            <Row gap={5}>
              <SLabel>Comment</SLabel>
              <span style={{ color: T.ember2, fontSize: 10 }}>*</span>
              {!draftComment.trim() && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>required</span>
              )}
            </Row>
            <DraftInput
              value={draftComment}
              onChange={setDraftComment}
              placeholder="What needs attention here?"
              multiline
              rows={4}
              hasError={!draftComment.trim()}
              autoFocus
            />
          </Col>

          {/* Annotation preview */}
          <Col gap={5}>
            <Row gap={5}>
              <SLabel>Annotation</SLabel>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>optional</span>
            </Row>
            {annotation ? (
              <Row gap={8} style={{
                background: 'rgba(232,83,26,0.06)', border: `1px solid rgba(232,83,26,0.25)`,
                borderRadius: 8, padding: '8px 10px',
              }}>
                {/* Mini preview */}
                <div style={{
                  width: 60, height: 42, background: 'rgba(20,6,2,0.7)',
                  border: `1px solid rgba(232,83,26,0.35)`, borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {annotation.type === 'circle' ? (
                    <svg width="42" height="28" viewBox="0 0 42 28">
                      <ellipse cx="21" cy="14" rx="14" ry="9" stroke={T.ember} strokeWidth="1.5" fill="none" strokeDasharray="3 2" />
                    </svg>
                  ) : (
                    <svg width="42" height="28" viewBox="0 0 42 28">
                      <rect x="4" y="4" width="34" height="20" stroke={T.ember} strokeWidth="1.5" fill="none" strokeDasharray="3 2" />
                    </svg>
                  )}
                </div>
                <Col gap={3} style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>
                    1 {annotation.type} linked
                  </span>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                    {lockedCtx?.camName ? `on ${lockedCtx.camName}` : ''}
                    {lockedCtx?.clipTime != null ? ` @ ${fmtTime(lockedCtx.clipTime)}` : ''}
                  </span>
                </Col>
                <button onClick={onRemoveAnnotation} style={{
                  background: T.glass, border: `1px solid ${T.border}`, borderRadius: 5,
                  color: T.text3, cursor: 'pointer', padding: '3px 8px', fontSize: 9,
                  fontFamily: 'Chakra Petch, sans-serif', flexShrink: 0,
                }}>Remove</button>
              </Row>
            ) : (
              <div style={{
                background: 'rgba(0,0,0,0.3)', border: `1px dashed rgba(220,100,30,0.25)`,
                borderRadius: 8, padding: '10px 12px', textAlign: 'center',
              }}>
                <span style={{ fontSize: 10, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                  Use the toolbar on the stage to draw a circle or region (optional)
                </span>
              </div>
            )}
          </Col>

          <Divider />

          {/* Previous feedback on this clip */}
          {prevFeedback.length > 0 && (
            <Col gap={5}>
              <SLabel>Previous on this clip ({prevFeedback.length})</SLabel>
              <Col gap={6}>
                {prevFeedback.map(f => (
                  <PrevFeedbackItem
                    key={f.id}
                    item={f}
                    isBusy={busyFeedbackId === f.id}
                    onUpdate={async (item, patch) => {
                      setBusyFeedbackId(item.id)
                      try {
                        await onUpdatePrevFeedback?.(item, patch)
                      } finally {
                        setBusyFeedbackId(null)
                      }
                    }}
                    onDelete={async (item) => {
                      setBusyFeedbackId(item.id)
                      try {
                        await onDeletePrevFeedback?.(item)
                      } finally {
                        setBusyFeedbackId(null)
                      }
                    }}
                  />
                ))}
              </Col>
            </Col>
          )}

        </Col>
      </div>

      {/* Submit error */}
      {submitError && (
        <div style={{ padding: '6px 14px', background: 'rgba(232,83,26,0.1)', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>{submitError}</span>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid rgba(220,100,30,0.14)`, display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={onCancel} disabled={isSubmitting} style={{
          flex: 1, padding: '7px', borderRadius: 6,
          fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 500,
          background: T.glass, border: `1px solid ${T.border}`, color: T.text2,
          cursor: 'pointer',
        }}>Cancel</button>
        <button onClick={() => onSubmit({ reviewerName: draftReviewerName, comment: draftComment })} disabled={!canSubmit} style={{
          flex: 1, padding: '7px', borderRadius: 6,
          fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 600,
          background: canSubmit ? `linear-gradient(180deg, ${T.ember2}, ${T.ember})` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${canSubmit ? T.ember2 : 'rgba(255,255,255,0.06)'}`,
          color: canSubmit ? 'white' : T.text4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          boxShadow: canSubmit ? `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.2)` : 'none',
        }}>
          {isSubmitting ? 'Submitting…' : '→ Submit'}
        </button>
      </div>
    </div>
  )
}

// ── Annotation layer (SVG overlay on the stage) ───────────────────────────────
export function AnnotationLayer({ annotation, activeTool, onAnnotationChange, readOnly = false }) {
  const svgRef = useRef(null)
  const [drawing, setDrawing] = useState(null) // { startX, startY, currentX, currentY }

  const normalize = useCallback((e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0, viewport: null }
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
      viewport: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    }
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (!activeTool) return
    e.preventDefault()
    const p = normalize(e)
    setDrawing({ startX: p.x, startY: p.y, currentX: p.x, currentY: p.y })
  }, [activeTool, normalize])

  const handleMouseMove = useCallback((e) => {
    if (!drawing) return
    const p = normalize(e)
    setDrawing(prev => ({ ...prev, currentX: p.x, currentY: p.y }))
  }, [drawing, normalize])

  const handleMouseUp = useCallback((e) => {
    if (!drawing || !activeTool) return
    const p = normalize(e)
    const x = Math.min(drawing.startX, p.x)
    const y = Math.min(drawing.startY, p.y)
    const w = Math.abs(p.x - drawing.startX)
    const h = Math.abs(p.y - drawing.startY)
    if (w > 0.01 || h > 0.01) {
      onAnnotationChange({ type: activeTool, bounds: { x, y, width: w, height: h }, viewport: p.viewport })
    }
    setDrawing(null)
  }, [drawing, activeTool, normalize, onAnnotationChange])

  // Render committed annotation
  const renderAnnotation = (annot, key = 'committed') => {
    if (!annot) return null
    const { bounds } = annot
    // SVG uses percentage-based coords via a 0-1 viewBox approach
    const x = bounds.x * 100
    const y = bounds.y * 100
    const w = bounds.width * 100
    const h = bounds.height * 100

    const strokeColor = '#FFB37A'
    const glowColor = 'rgba(255,179,122,0.55)'

    if (annot.type === 'circle') {
      return (
        <ellipse key={key} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2}
          stroke={strokeColor} strokeWidth="2.4" fill="rgba(255,179,122,0.04)" strokeDasharray="10 8"
          vectorEffect="non-scaling-stroke"
          style={{ filter: `drop-shadow(0 0 5px ${glowColor})` }} />
      )
    }
    return (
      <rect key={key} x={x} y={y} width={w} height={h}
        stroke={strokeColor} strokeWidth="2.4" fill="rgba(255,179,122,0.04)" strokeDasharray="10 8"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 5px ${glowColor})` }} />
    )
  }

  // Preview while drawing
  const renderPreview = () => {
    if (!drawing || !activeTool) return null
    const bounds = {
      x: Math.min(drawing.startX, drawing.currentX),
      y: Math.min(drawing.startY, drawing.currentY),
      width:  Math.abs(drawing.currentX - drawing.startX),
      height: Math.abs(drawing.currentY - drawing.startY),
    }
    return renderAnnotation({ type: activeTool, bounds }, 'preview')
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        cursor: activeTool ? 'crosshair' : 'default',
        zIndex: 5,
        pointerEvents: readOnly ? 'none' : (activeTool || annotation ? 'all' : 'none'),
      }}
    >
      {renderAnnotation(annotation)}
      {renderPreview()}
    </svg>
  )
}

// ── Annotation toolbar (floating at bottom of stage) ─────────────────────────
export function AnnotationToolbar({ activeTool, onToolChange, onClear, hasAnnotation, onSave }) {
  return (
    <div style={{
      position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(8,5,3,0.94)', border: `1px solid rgba(232,83,26,0.3)`,
      borderRadius: 10, padding: '7px 14px',
      display: 'flex', gap: 10, alignItems: 'center',
      backdropFilter: 'blur(14px)', zIndex: 10,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: T.text2, fontFamily: 'Chakra Petch, sans-serif', letterSpacing: '0.06em' }}>
        ANNOTATE:
      </span>
      <ToolBtn label="○ Circle"  active={activeTool === 'circle'} onClick={() => onToolChange(activeTool === 'circle' ? null : 'circle')} />
      <ToolBtn label="□ Region"  active={activeTool === 'region'} onClick={() => onToolChange(activeTool === 'region' ? null : 'region')} />
      <div style={{ width: 1, height: 18, background: 'rgba(220,100,30,0.25)' }} />
      <button onClick={onClear} disabled={!hasAnnotation} style={{
        padding: '4px 10px', borderRadius: 5, fontSize: 10,
        fontFamily: 'Chakra Petch, sans-serif', cursor: hasAnnotation ? 'pointer' : 'not-allowed',
        background: 'transparent', border: `1px solid ${hasAnnotation ? T.border : 'rgba(255,255,255,0.06)'}`,
        color: hasAnnotation ? T.text3 : T.text4,
      }}>✕ Clear</button>
      {onSave && (
        <>
          <div style={{ width: 1, height: 18, background: 'rgba(232,83,26,0.35)' }} />
          <button
            onClick={onSave}
            disabled={!hasAnnotation}
            style={{
              padding: '4px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600,
              fontFamily: 'Chakra Petch, sans-serif',
              cursor: hasAnnotation ? 'pointer' : 'not-allowed',
              background: hasAnnotation ? `linear-gradient(180deg, ${T.ember2}, ${T.ember})` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${hasAnnotation ? T.ember2 : 'rgba(255,255,255,0.06)'}`,
              color: hasAnnotation ? 'white' : T.text4,
              boxShadow: hasAnnotation ? T.emberGlow : 'none',
              opacity: hasAnnotation ? 1 : 0.5,
            }}
          >✓ Confirm</button>
        </>
      )}
    </div>
  )
}

function ToolBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 5, fontSize: 10,
      fontFamily: 'Chakra Petch, sans-serif', cursor: 'pointer',
      background: active ? T.emberDim : 'transparent',
      border: `1px solid ${active ? T.ember : T.border}`,
      color: active ? T.ember2 : T.text2,
      fontWeight: active ? 600 : 400,
    }}>{label}</button>
  )
}

// ── Feedback-mode top bar ─────────────────────────────────────────────────────
export function FeedbackTopBar({ lockedCtx, onCancel }) {
  const ctxPill = [
    lockedCtx?.slideTitle ? `Clip: ${lockedCtx.slideTitle}` : null,
    lockedCtx?.camName,
    lockedCtx?.clipTime != null ? fmtTime(lockedCtx.clipTime) : null,
    lockedCtx?.versionLabel,
  ].filter(Boolean).join(' · ')

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
        Capturing Feedback
      </span>

      <div style={{ width: 1, height: 22, background: 'rgba(232,83,26,0.3)' }} />

      {/* Lock tag */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600,
        background: 'rgba(232,83,26,0.16)', border: `1px solid ${T.ember}`,
        color: T.ember2, fontFamily: 'Chakra Petch, sans-serif',
        boxShadow: T.emberGlow,
      }}>
        🔒 Camera &amp; Clip Locked
      </span>

      {/* Context pill */}
      {ctxPill && (
        <span style={{
          background: 'rgba(232,83,26,0.1)', border: `1px solid rgba(232,83,26,0.35)`,
          borderRadius: 5, padding: '3px 10px',
          fontSize: 10, color: T.ember2, fontWeight: 600,
          fontFamily: 'Chakra Petch, sans-serif',
        }}>
          {ctxPill}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <button onClick={onCancel} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 500,
        background: T.glass, border: `1px solid ${T.border}`, color: T.text2,
      }}>
        ✕ Cancel
      </button>
    </div>
  )
}

// ── Inline lock banner (below feedback/annotation topbar) ─────────────────────
/** mode: 'feedback' | 'annotation' */
export function StageLockBanner({ lockedCtx, mode = 'feedback' }) {
  const prefix = mode === 'annotation' ? 'Annotation Mode' : 'Feedback Draft'
  const line = [
    prefix,
    lockedCtx?.slideTitle,
    lockedCtx?.camName ? `${lockedCtx.camName} camera` : null,
    lockedCtx?.clipTime != null ? fmtTime(lockedCtx.clipTime) : null,
    lockedCtx?.versionLabel ? `attached to ${lockedCtx.versionLabel}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      padding: '5px 14px', background: 'rgba(20,6,2,0.92)',
      borderBottom: `1px solid rgba(232,83,26,0.25)`,
      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    }}>
      <span style={{ color: 'rgba(232,83,26,0.85)', fontSize: 11 }}>🔒</span>
      <span style={{ fontSize: 11, color: 'rgba(255,180,140,0.9)', fontWeight: 500, fontFamily: 'Chakra Petch, sans-serif' }}>
        {line}
      </span>
    </div>
  )
}

/** @deprecated Use StageLockBanner instead */
export function FeedbackLockBanner({ lockedCtx }) {
  return <StageLockBanner lockedCtx={lockedCtx} mode="feedback" />
}

// ── Lock badge (top-left of stage during feedback) ────────────────────────────
export function StageLockBadge({ camName, clipTime }) {
  return (
    <div style={{
      position: 'absolute', top: 10, left: 14, zIndex: 8,
      background: 'rgba(232,83,26,0.12)', border: `1px solid rgba(232,83,26,0.4)`,
      borderRadius: 5, padding: '4px 9px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ color: T.ember, fontSize: 11 }}>🔒</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>
        {camName ?? 'CAM'}{clipTime != null ? ` · ${fmtTime(clipTime)} · LOCKED` : ' · LOCKED'}
      </span>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function miniBtnStyle(enabled, danger = false) {
  return {
    padding: '3px 8px',
    borderRadius: 5,
    fontSize: 9,
    fontFamily: 'Chakra Petch, sans-serif',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: danger ? 'rgba(232,83,26,0.10)' : T.glass,
    border: `1px solid ${danger ? 'rgba(232,83,26,0.35)' : T.border}`,
    color: enabled ? (danger ? T.ember2 : T.text2) : T.text4,
    opacity: enabled ? 1 : 0.6,
  }
}

function fmtTime(s) {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return `${String(m).padStart(2, '0')}:${sec}`
}

function DraftInput({ value, onChange, placeholder, multiline = false, rows = 2, hasError = false, autoFocus = false, disabled = false }) {
  const [focused, setFocused] = useState(false)
  const style = {
    width: '100%',
    background: disabled ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.35)',
    border: `1px solid ${hasError && !focused ? 'rgba(232,83,26,0.5)' : focused ? 'rgba(220,100,30,0.32)' : 'rgba(220,100,30,0.18)'}`,
    borderRadius: 6, padding: '7px 9px',
    fontFamily: 'Chakra Petch, sans-serif', fontSize: 11,
    color: disabled ? T.text2 : (value ? T.text : T.text3), outline: 'none', lineHeight: 1.5, resize: 'vertical',
    boxShadow: focused ? '0 0 0 2px rgba(232,83,26,0.12)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    cursor: disabled ? 'not-allowed' : 'text',
  }
  const handlers = {
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
    onChange: e => onChange(e.target.value),
    autoFocus,
    disabled,
  }
  if (multiline) return <textarea value={value} placeholder={placeholder} rows={rows} style={style} {...handlers} />
  return <input type="text" value={value} placeholder={placeholder} style={style} {...handlers} />
}

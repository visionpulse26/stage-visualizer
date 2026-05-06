import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import { supabase } from '../lib/supabaseClient'
import {
  loadDraft,
  loadPublishedVersion,
  saveDraft,
  publishVersion,
  loadFeedback,
  setFeedbackStatus,
  buildSnapshot,
  snapshotSummary,
  slidePublishChecklist,
} from '../lib/presentationVersions'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
import { fetchAndCacheAsset } from '../utils/secureAssetLoader'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import { useStageLoading } from '../hooks/useStageLoading'
import { useBlobUrlCache } from '../hooks/useBlobUrlCache'

// ── Design tokens (mirror Hi-Fi v2 CSS vars) ─────────────────────────────────
const T = {
  bg:        '#080604',
  glass:     'rgba(255,255,255,0.045)',
  glass2:    'rgba(255,255,255,0.07)',
  glassDark: 'rgba(8,6,4,0.65)',
  border:    'rgba(220,100,30,0.20)',
  border2:   'rgba(220,100,30,0.32)',
  ember:     '#E8531A',
  ember2:    '#FF6B2B',
  emberDim:  'rgba(232,83,26,0.15)',
  emberGlow: '0 0 14px rgba(232,83,26,0.45), 0 0 2px rgba(232,83,26,0.8)',
  cam:       '#1FA0EE',
  camDim:    'rgba(31,160,238,0.15)',
  camGlow:   '0 0 10px rgba(31,160,238,0.35)',
  green:     '#2BC782',
  amber:     '#E89518',
  text:      '#F4ECE2',
  text2:     '#C8B8A8',
  text3:     '#8E7E70',
  text4:     '#5A4E45',
}

// ── Tiny layout helpers ───────────────────────────────────────────────────────
const Row = ({ children, gap = 6, align = 'center', wrap = false, style = {} }) => (
  <div style={{ display: 'flex', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap', ...style }}>
    {children}
  </div>
)
const Col = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
)
const Spacer = ({ f, w, h }) => <div style={{ flex: f, width: w, height: h, flexShrink: 0 }} />
const Label = ({ children, style = {} }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3, fontFamily: 'Chakra Petch, sans-serif', ...style }}>
    {children}
  </span>
)
const Divider = ({ style = {} }) => (
  <div style={{ height: 1, background: 'rgba(220,100,30,0.12)', ...style }} />
)

// ── Small UI primitives ───────────────────────────────────────────────────────
function GhostBtn({ children, style = {}, onClick, danger = false }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 500,
        cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em',
        transition: 'all 0.15s',
        background: hov ? T.glass2 : T.glass,
        border: `1px solid ${danger ? 'rgba(232,83,26,0.3)' : (hov ? T.border2 : T.border)}`,
        color: danger ? 'rgba(232,83,26,0.8)' : (hov ? T.text : T.text2),
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function EmberBtn({ children, style = {}, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 13px', borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        background: disabled
          ? 'rgba(255,255,255,0.04)'
          : `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : T.ember2}`,
        color: disabled ? T.text4 : 'white',
        boxShadow: disabled ? 'none' : `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function CamPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '3px 9px', borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 10, fontWeight: active ? 600 : 500,
        cursor: 'pointer', letterSpacing: '0.04em',
        background: active ? T.camDim : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? T.cam : 'rgba(255,255,255,0.1)'}`,
        color: active ? T.cam : T.text3,
        boxShadow: active ? T.camGlow : 'none',
      }}
    >
      {label}
    </button>
  )
}

function StatusTag({ type, children }) {
  const colors = {
    unsaved:   { bg: 'rgba(232,149,24,0.16)',  border: T.amber,  color: T.amber  },
    published: { bg: 'rgba(43,199,130,0.13)',  border: T.green,  color: T.green  },
    pending:   { bg: 'rgba(232,149,24,0.12)',  border: 'rgba(232,149,24,0.55)', color: T.amber },
    resolved:  { bg: 'rgba(43,199,130,0.10)',  border: 'rgba(43,199,130,0.45)', color: T.green },
    draft:     { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', color: '#B0A090' },
  }
  const c = colors[type] ?? colors.draft
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
      fontFamily: 'Chakra Petch, sans-serif',
      background: c.bg, border: `1px solid ${c.border}`, color: c.color,
    }}>
      {children}
    </span>
  )
}

// ── Left panel: Slide/Clip list ───────────────────────────────────────────────
function SlideList({ slides, activeSlideId, onSelect, onAdd, onReorder }) {
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const handleDragStart = (e, id) => { setDragging(id); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver  = (e, id) => { e.preventDefault(); setDragOver(id) }
  const handleDrop      = (e, id) => {
    e.preventDefault()
    if (dragging && dragging !== id) onReorder(dragging, id)
    setDragging(null); setDragOver(null)
  }

  return (
    <div style={{
      width: 208, flexShrink: 0,
      background: T.glassDark, backdropFilter: 'blur(14px)',
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '9px 12px', borderBottom: `1px solid rgba(220,100,30,0.12)`, flexShrink: 0 }}>
        <Row gap={6}>
          <Label>Clips · {slides.length} total</Label>
          <Spacer f={1} />
          <GhostBtn style={{ padding: '3px 7px', fontSize: 10 }} onClick={onAdd}>+ Clip</GhostBtn>
        </Row>
      </div>

      {/* Slide rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
        {slides.map((slide, idx) => {
          const isActive = slide.id === activeSlideId
          const isDragOver = slide.id === dragOver
          return (
            <div
              key={slide.id}
              draggable
              onDragStart={e => handleDragStart(e, slide.id)}
              onDragOver={e => handleDragOver(e, slide.id)}
              onDrop={e => handleDrop(e, slide.id)}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              onClick={() => onSelect(slide.id)}
              style={{
                display: 'flex', gap: 8, alignItems: 'center',
                padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                background: isActive ? 'rgba(232,83,26,0.08)' : 'transparent',
                borderLeft: `2px solid ${isActive ? T.ember : 'transparent'}`,
                borderTop: isDragOver ? `1px solid ${T.ember}` : '1px solid transparent',
                opacity: slide.hiddenFromClient ? 0.55 : 1,
                transition: 'all 0.12s',
              }}
            >
              {/* Drag handle */}
              <DragIcon />

              {/* Thumbnail placeholder */}
              <div style={{
                width: 46, height: 30, borderRadius: 5, flexShrink: 0,
                background: '#1a1410',
                border: `1px solid ${isActive ? T.ember : 'rgba(220,100,30,0.15)'}`,
                boxShadow: isActive ? '0 0 10px rgba(232,83,26,0.3)' : 'none',
                backgroundImage: 'repeating-linear-gradient(135deg, #1a1410 0px, #1a1410 3px, #201810 3px, #201810 9px)',
              }} />

              <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Row gap={4}>
                  <span style={{
                    fontSize: 11, fontWeight: isActive ? 600 : 500,
                    color: isActive ? T.text : T.text2, fontFamily: 'Chakra Petch, sans-serif',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {slide.title || 'Untitled'}
                  </span>
                  {slide.hiddenFromClient && <EyeOffIcon color={T.text3} />}
                </Row>
                <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                  {formatDuration(slide.durationSeconds)} · #{idx + 1}
                </span>
              </Col>

              {/* Feedback badge */}
              {(slide._feedbackCount ?? 0) > 0 && (
                <div style={{
                  background: T.amber, borderRadius: 9, padding: '1px 6px',
                  fontSize: 9, color: '#1a0a00', fontWeight: 700, flexShrink: 0,
                }}>
                  {slide._feedbackCount}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '8px 10px', borderTop: 'rgba(220,100,30,0.1) 1px solid' }}>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
          Drag rows to reorder
        </span>
      </div>
    </div>
  )
}

// ── Right panel: Context tab ──────────────────────────────────────────────────
function ContextPanel({ slide, cameraPresets, onChange, onDuplicate, onToggleHidden, onDelete }) {
  if (!slide) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: T.text4, fontFamily: 'Chakra Petch, sans-serif' }}>
          Select a slide to edit
        </span>
      </div>
    )
  }

  const checklist = slidePublishChecklist(slide)
  const issues    = checklist.filter(c => !c.ok).length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
      <Col gap={11}>

        {/* Title */}
        <Col gap={4}>
          <Label>Clip Title</Label>
          <TextInput
            value={slide.title}
            onChange={v => onChange({ title: v })}
            placeholder="Enter clip title…"
          />
        </Col>

        {/* Subtitle */}
        <Col gap={4}>
          <Label>Subtitle</Label>
          <TextInput
            value={slide.subtitle}
            onChange={v => onChange({ subtitle: v })}
            placeholder="Add subtitle or camera note…"
          />
        </Col>

        {/* Director's Note */}
        <Col gap={4}>
          <Row gap={6}>
            <Label>Director's Note</Label>
            <Spacer f={1} />
            <button
              onClick={() => onChange({ directorNoteVisible: !slide.directorNoteVisible })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '1px 6px',
                borderRadius: 4, cursor: 'pointer', border: 'none',
                background: slide.directorNoteVisible
                  ? 'rgba(43,199,130,0.1)' : 'rgba(255,255,255,0.05)',
                borderWidth: 1, borderStyle: 'solid',
                borderColor: slide.directorNoteVisible
                  ? 'rgba(43,199,130,0.3)' : 'rgba(255,255,255,0.1)',
              }}
            >
              {slide.directorNoteVisible
                ? <EyeIcon color={T.green} />
                : <EyeOffIcon color={T.text3} />}
              <span style={{
                fontSize: 9, fontWeight: 600, fontFamily: 'Chakra Petch, sans-serif',
                color: slide.directorNoteVisible ? T.green : T.text3,
              }}>
                {slide.directorNoteVisible ? 'Visible to client' : 'Hidden from client'}
              </span>
            </button>
          </Row>
          <TextInput
            value={slide.directorNote}
            onChange={v => onChange({ directorNote: v })}
            placeholder="Write a director's note for this clip…"
            multiline
            rows={4}
          />
        </Col>

        {/* Default Camera */}
        <Col gap={4}>
          <Label>Default Camera</Label>
          <Row gap={5} style={{ flexWrap: 'wrap' }}>
            {cameraPresets.map(p => (
              <CamPill
                key={p.id}
                label={p.name}
                active={slide.defaultCameraPresetId === p.id}
                onClick={() => onChange({ defaultCameraPresetId: p.id })}
              />
            ))}
            {cameraPresets.length === 0 && (
              <span style={{ fontSize: 10, color: T.text4, fontFamily: 'Chakra Petch, sans-serif' }}>
                No camera presets defined
              </span>
            )}
          </Row>
        </Col>

        <Divider />

        {/* References */}
        <Col gap={6}>
          <Row gap={6}>
            <Label>References ({(slide.references ?? []).length})</Label>
            <Spacer f={1} />
            <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>drag to reorder</span>
            <GhostBtn style={{ padding: '2px 7px', fontSize: 10 }}
              onClick={() => onChange({ references: [...(slide.references ?? []), newRef()] })}>
              + Add
            </GhostBtn>
          </Row>

          {(slide.references ?? []).length === 0 && (
            <div style={{
              background: 'rgba(0,0,0,0.2)', border: `1px dashed rgba(220,100,30,0.18)`,
              borderRadius: 7, padding: '14px 12px', textAlign: 'center',
            }}>
              <span style={{ fontSize: 10, color: T.text4, fontFamily: 'Chakra Petch, sans-serif' }}>
                No references yet — add a mood board, layout, or lighting plot
              </span>
            </div>
          )}

          {(slide.references ?? []).map((ref, i) => (
            <RefRow
              key={ref.id}
              ref_={ref}
              onChange={updated => {
                const refs = [...(slide.references ?? [])]
                refs[i] = updated
                onChange({ references: refs })
              }}
              onDelete={() => {
                const refs = (slide.references ?? []).filter((_, j) => j !== i)
                onChange({ references: refs })
              }}
            />
          ))}
        </Col>

        <Divider />

        {/* Publish Checklist */}
        <Col gap={6}>
          <Row gap={6}>
            <Label>Publish Checklist</Label>
            <Spacer f={1} />
            {issues > 0
              ? <StatusTag type="pending">{issues} {issues === 1 ? 'issue' : 'issues'}</StatusTag>
              : <StatusTag type="published">Ready</StatusTag>}
          </Row>
          <div style={{
            background: 'rgba(0,0,0,0.28)', border: `1px solid rgba(220,100,30,0.12)`,
            borderRadius: 7, padding: '8px 10px',
          }}>
            <Col gap={5}>
              {checklist.map((item, i) => (
                <Row key={i} gap={7}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    background: item.ok
                      ? 'rgba(43,199,130,0.18)'
                      : item.warn ? 'rgba(232,149,24,0.18)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${item.ok
                      ? 'rgba(43,199,130,0.5)'
                      : item.warn ? 'rgba(232,149,24,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {item.ok && <span style={{ color: T.green, fontSize: 8, lineHeight: 1 }}>✓</span>}
                    {!item.ok && item.warn && <span style={{ color: T.amber, fontSize: 8, lineHeight: 1 }}>!</span>}
                  </div>
                  <span style={{
                    fontSize: 10, fontFamily: 'Chakra Petch, sans-serif',
                    color: item.ok ? T.text2 : item.warn ? T.amber : T.text3,
                  }}>
                    {item.label}
                  </span>
                </Row>
              ))}
            </Col>
          </div>
        </Col>

        <Divider />

        {/* Slide Actions */}
        <Col gap={6}>
          <Label>Slide Actions</Label>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <GhostBtn onClick={onDuplicate}>⧉ Duplicate</GhostBtn>
            <GhostBtn onClick={onToggleHidden}>
              {slide.hiddenFromClient ? '👁 Show to client' : '🚫 Hide from client'}
            </GhostBtn>
            <GhostBtn danger onClick={onDelete}>✕ Delete</GhostBtn>
          </Row>
        </Col>

      </Col>
    </div>
  )
}

// ── Right panel: Feedback tab ─────────────────────────────────────────────────
function FeedbackPanel({ feedback, slideName, versionLabel, onResolve, onJumpToClip, onOpenFullReview }) {
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'open')     return feedback.filter(f => f.status === 'pending')
    if (filter === 'resolved') return feedback.filter(f => f.status === 'resolved')
    return feedback
  }, [feedback, filter])

  const openCount     = feedback.filter(f => f.status === 'pending').length
  const resolvedCount = feedback.filter(f => f.status === 'resolved').length

  return (
    <>
      {/* Sub-header */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid rgba(220,100,30,0.08)`, background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
        <Col gap={3}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>
            {slideName ? `Feedback for "${slideName}"` : 'Feedback'}
          </span>
          <Row gap={6}>
            <StatusTag type="pending">{openCount} open</StatusTag>
            <StatusTag type="resolved">{resolvedCount} resolved</StatusTag>
            <Spacer f={1} />
            {versionLabel && (
              <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                {versionLabel}
              </span>
            )}
          </Row>
        </Col>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid rgba(220,100,30,0.08)`, display: 'flex', gap: 5, flexShrink: 0 }}>
        {[['all', `All (${feedback.length})`], ['open', `Open (${openCount})`], ['resolved', `Resolved (${resolvedCount})`]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '5px 11px', fontSize: 9, fontWeight: filter === id ? 600 : 500,
            borderRadius: 5, cursor: 'pointer',
            fontFamily: 'Chakra Petch, sans-serif', letterSpacing: '0.04em',
            background: filter === id ? T.emberDim : 'transparent',
            border: `1px solid ${filter === id ? T.ember : 'transparent'}`,
            color: filter === id ? T.ember2 : T.text3,
          }}>{label}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <span style={{ fontSize: 11, color: T.text4, fontFamily: 'Chakra Petch, sans-serif' }}>
              No {filter !== 'all' ? filter : ''} feedback for this clip
            </span>
          </div>
        )}
        <Col gap={7}>
          {filtered.map(item => (
            <FeedbackCard
              key={item.id}
              item={item}
              onResolve={() => onResolve(item.id, item.status === 'pending' ? 'resolved' : 'pending')}
              onJump={() => onJumpToClip(item)}
            />
          ))}
        </Col>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid rgba(220,100,30,0.1)`, flexShrink: 0 }}>
        <GhostBtn style={{ width: '100%', justifyContent: 'center' }} onClick={onOpenFullReview}>
          Open full Feedback Review →
        </GhostBtn>
      </div>
    </>
  )
}

function FeedbackCard({ item, onResolve, onJump }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.28)',
        border: `1px solid ${hov ? T.border2 : 'rgba(220,100,30,0.1)'}`,
        borderRadius: 8, padding: '8px 10px', transition: 'all 0.15s',
      }}
    >
      <Row gap={7} style={{ marginBottom: 5 }}>
        <Avatar name={item.reviewer_name} size={20} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>
          {item.reviewer_name || 'Reviewer'}
        </span>
        <StatusTag type={item.status}>{item.status}</StatusTag>
        <Spacer f={1} />
        <span style={{ fontSize: 9, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
          {timeAgo(item.created_at)}
        </span>
      </Row>

      <span style={{
        fontSize: 11, color: T.text2, display: 'block',
        paddingLeft: 27, lineHeight: 1.5, fontFamily: 'Chakra Petch, sans-serif',
      }}>
        {item.comment}
      </span>

      {/* Camera / timestamp badge */}
      {(item.camera_snapshot_json?.name || item.clip_time_seconds != null) && (
        <Row gap={5} style={{ marginTop: 5, paddingLeft: 27 }}>
          <div style={{
            background: T.camDim, border: '1px solid rgba(31,160,238,0.3)',
            borderRadius: 4, padding: '1px 6px', fontSize: 9, color: T.cam, fontWeight: 500,
            fontFamily: 'Chakra Petch, sans-serif',
          }}>
            {item.camera_snapshot_json?.name ?? ''}
            {item.clip_time_seconds != null && ` · ${formatTimecode(item.clip_time_seconds)}`}
          </div>
        </Row>
      )}

      <Row gap={6} style={{ marginTop: 7, paddingLeft: 27 }}>
        <GhostBtn style={{ padding: '2px 8px', fontSize: 9 }} onClick={onResolve}>
          {item.status === 'resolved' ? '↺ Reopen' : '✓ Resolve'}
        </GhostBtn>
        <GhostBtn style={{ padding: '2px 8px', fontSize: 9 }} onClick={onJump}>
          → Jump to clip
        </GhostBtn>
      </Row>
    </div>
  )
}

// ── Publish Modal ─────────────────────────────────────────────────────────────
function PublishModal({ slides, cameraPresets, projectName, publishedVersionNumber, onCancel, onSaveDraft, onPublish, saving }) {
  const [versionName, setVersionName] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')

  const snapshot  = buildSnapshot(projectName, slides, cameraPresets)
  const summary   = snapshotSummary(snapshot)
  const nextNum   = (publishedVersionNumber ?? 0) + 1

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,2,0.6)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        width: 480, background: 'linear-gradient(180deg, rgba(20,14,10,0.96), rgba(12,8,6,0.96))',
        border: `1px solid ${T.border2}`, borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(16px)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid rgba(220,100,30,0.18)` }}>
          <Row gap={8}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.ember, boxShadow: T.emberGlow }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>
              Publish New Version
            </span>
            <Spacer f={1} />
            <button onClick={onCancel} style={{ background: 'none', border: 'none', color: T.text3, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </Row>
          <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
            {projectName} · was v{publishedVersionNumber ?? '—'}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 18px' }}>
          <Col gap={14}>
            <Col gap={5}>
              <Label>Version Name</Label>
              <TextInput
                value={versionName}
                onChange={setVersionName}
                placeholder={`v${nextNum} — describe what changed…`}
              />
            </Col>
            <Col gap={5}>
              <Label>Release Notes (optional)</Label>
              <TextInput
                value={releaseNotes}
                onChange={setReleaseNotes}
                placeholder="What changed in this version?"
                multiline
                rows={3}
              />
            </Col>

            {/* Snapshot summary */}
            <Col gap={6}>
              <Label>Snapshot Summary</Label>
              <div style={{
                background: 'rgba(0,0,0,0.35)', border: `1px solid rgba(220,100,30,0.15)`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <Col gap={6}>
                  {[
                    ['Clips',        `${summary.clipsTotal} total · ${summary.clipsHidden} hidden from client`],
                    ['References',   `${summary.refsTotal} total · ${summary.refsHidden} hidden`],
                    ['Cameras',      `${summary.camerasEnabled} presets enabled`],
                    ['Total runtime',summary.totalRuntime],
                  ].map(([k, v]) => (
                    <Row key={k} gap={6}>
                      <span style={{ fontSize: 10, color: T.text3, minWidth: 80, fontFamily: 'Chakra Petch, sans-serif' }}>{k}</span>
                      <span style={{ fontSize: 11, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>{v}</span>
                    </Row>
                  ))}
                </Col>
              </div>
            </Col>

            {/* Warning copy (roadmap required) */}
            <div style={{
              background: 'rgba(232,83,26,0.06)', border: `1px solid rgba(232,83,26,0.22)`,
              borderRadius: 8, padding: '10px 12px',
            }}>
              <Row gap={8} align="flex-start">
                <span style={{ color: T.ember2, marginTop: 2, fontSize: 12 }}>🔒</span>
                <Col gap={2}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif' }}>
                    Client feedback will attach to v{nextNum}
                  </span>
                  <span style={{ fontSize: 10, color: T.text2, lineHeight: 1.5, display: 'block', fontFamily: 'Chakra Petch, sans-serif' }}>
                    All new feedback will be linked to this published version, the camera in view, and the timestamp it was captured at. Existing feedback remains linked to its original version.
                  </span>
                </Col>
              </Row>
            </div>
          </Col>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid rgba(220,100,30,0.14)`, display: 'flex', gap: 8 }}>
          <Spacer f={1} />
          <GhostBtn onClick={onCancel} disabled={saving}>Cancel</GhostBtn>
          <GhostBtn onClick={() => onSaveDraft(versionName, releaseNotes)} disabled={saving}>Save as Draft</GhostBtn>
          <EmberBtn
            onClick={() => onPublish(versionName || `v${nextNum}`, releaseNotes)}
            disabled={saving}
          >
            → Publish v{nextNum}
          </EmberBtn>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PresentationEditorPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  // ── Stage / model ─────────────────────────────────────────────────────────
  const [modelUrl,       setModelUrl]       = useState(null)
  const [videoElement,   setVideoElement]   = useState(null)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [videoLoaded,    setVideoLoaded]    = useState(false)
  const [projectName,    setProjectName]    = useState('Project')
  const [cameraPresets,  setCameraPresets]  = useState([])
  const [activePresetId, setActivePresetId] = useState(null)
  const cameraControlsRef   = useRef(null)
  const cameraTargetPresetRef = useRef(null)

  const [sunPosition] = useState([10.6, 10.6, 7.5])
  const [sunIntensity] = useState(1)
  const [gridCellSize] = useState(1)

  const { loadingManager, loaded: stageLoaded, reset: resetStageLoading } = useStageLoading()
  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()

  // ── Video playlist → slides ───────────────────────────────────────────────
  const [videoPlaylist, setVideoPlaylist] = useState([])   // raw DB playlist
  const videoRef = useRef(null)

  // ── Presentation editor state ─────────────────────────────────────────────
  const [slides,          setSlides]          = useState([])
  const [activeSlideId,   setActiveSlideId]   = useState(null)
  const [rightTab,        setRightTab]        = useState('context')  // 'context' | 'feedback'
  const [isDirty,         setIsDirty]         = useState(false)
  const [isSaving,        setIsSaving]        = useState(false)
  const [saveError,       setSaveError]       = useState(null)
  const [showPublish,     setShowPublish]      = useState(false)
  const [publishedVersion, setPublishedVersion] = useState(null)  // latest published

  // ── Feedback for active slide ─────────────────────────────────────────────
  const [slideFeedback, setSlideFeedback] = useState([])

  // ── Loading ───────────────────────────────────────────────────────────────
  const [isDbLoading, setIsDbLoading] = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)

  const activeSlide = slides.find(s => s.id === activeSlideId) ?? null

  // ── Load project from DB ──────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    resetStageLoading()
    setIsDbLoading(true)
    setProjectNotFound(false)

    async function load() {
      try {
        const { data: p, error } = await supabase
          .from('projects')
          .select('name, stage_url, media_playlist, camera_presets, grid_cell_size, scene_config')
          .eq('id', projectId)
          .maybeSingle()

        if (error || !p) { setProjectNotFound(true); return }

        setProjectName(p.name ?? 'Project')
        setCameraPresets(p.camera_presets ?? [])

        // Load model
        if (p.stage_url) {
          const url = await fetchAndCacheAsset(p.stage_url, projectId, addBlob)
          setModelUrl(url)
        }

        // Restore playlist → slides
        const playlist = p.media_playlist ?? []
        setVideoPlaylist(playlist)

        // Load presentation draft or build from playlist
        const draft = await loadDraft(projectId)
        const published = await loadPublishedVersion(projectId)
        setPublishedVersion(published)

        if (draft?.snapshot_json?.slides?.length) {
          setSlides(draft.snapshot_json.slides)
          const first = draft.snapshot_json.slides[0]
          if (first) setActiveSlideId(first.id)
        } else {
          // Bootstrap slides from media_playlist
          const bootstrapped = playlist.map((clip, i) => makeSlideFromClip(clip, i, p.camera_presets))
          setSlides(bootstrapped)
          if (bootstrapped[0]) setActiveSlideId(bootstrapped[0].id)
        }

        // Activate first video
        if (playlist[0]) activatePlaylistClip(playlist[0])
      } catch (err) {
        console.error('[PresentationEditor] load error', err)
      } finally {
        setIsDbLoading(false)
      }
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // When active slide changes, activate its clip and load feedback
  useEffect(() => {
    if (!activeSlide) return

    const clip = videoPlaylist.find(c => c.id === activeSlide.clipId || c.name === activeSlide.clipId)
    if (clip) activatePlaylistClip(clip)

    if (activeSlide.defaultCameraPresetId) {
      setActivePresetId(activeSlide.defaultCameraPresetId)
      setCameraTargetPreset(cameraTargetPresetRef, activeSlide.defaultCameraPresetId)
    }

    if (projectId) {
      loadFeedback(projectId, { slideId: activeSlide.id })
        .then(setSlideFeedback)
        .catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlideId, projectId])

  // ── Video activation ──────────────────────────────────────────────────────
  const activatePlaylistClip = useCallback((clip) => {
    if (!clip?.url) return
    if (clip.type === 'image') {
      setActiveImageUrl(clip.url)
      setVideoElement(null)
      setVideoLoaded(true)
    } else {
      setActiveImageUrl(null)
      if (!videoRef.current) videoRef.current = document.createElement('video')
      const vid = videoRef.current
      vid.src = clip.url
      vid.loop = true
      vid.muted = true
      vid.playsInline = true
      vid.play().catch(() => {})
      setVideoElement(vid)
      setVideoLoaded(true)
    }
  }, [])

  // ── Slide mutations ───────────────────────────────────────────────────────
  const markDirty = useCallback(() => setIsDirty(true), [])

  const updateActiveSlide = useCallback((patch) => {
    setSlides(prev => prev.map(s => s.id === activeSlideId ? { ...s, ...patch } : s))
    markDirty()
  }, [activeSlideId, markDirty])

  const selectSlide = useCallback((id) => setActiveSlideId(id), [])

  const addSlide = useCallback(() => {
    const slide = makeBlankSlide(slides.length)
    setSlides(prev => [...prev, slide])
    setActiveSlideId(slide.id)
    markDirty()
  }, [slides.length, markDirty])

  const duplicateSlide = useCallback(() => {
    if (!activeSlide) return
    const clone = { ...activeSlide, id: `slide_${Date.now()}`, title: activeSlide.title + ' (copy)' }
    setSlides(prev => {
      const idx = prev.findIndex(s => s.id === activeSlideId)
      const next = [...prev]
      next.splice(idx + 1, 0, clone)
      return next
    })
    setActiveSlideId(clone.id)
    markDirty()
  }, [activeSlide, activeSlideId, markDirty])

  const toggleHidden = useCallback(() => {
    updateActiveSlide({ hiddenFromClient: !activeSlide?.hiddenFromClient })
  }, [activeSlide, updateActiveSlide])

  const deleteSlide = useCallback(() => {
    if (!activeSlide) return
    if (!window.confirm(`Delete "${activeSlide.title || 'this slide'}"?`)) return
    const remaining = slides.filter(s => s.id !== activeSlideId)
    setSlides(remaining)
    setActiveSlideId(remaining[0]?.id ?? null)
    markDirty()
  }, [activeSlide, activeSlideId, slides, markDirty])

  const reorderSlides = useCallback((dragId, dropId) => {
    setSlides(prev => {
      const arr = [...prev]
      const fromIdx = arr.findIndex(s => s.id === dragId)
      const toIdx   = arr.findIndex(s => s.id === dropId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
    markDirty()
  }, [markDirty])

  // ── Camera preset selection ───────────────────────────────────────────────
  const selectCamera = useCallback((presetId) => {
    setActivePresetId(presetId)
    setCameraTargetPreset(cameraTargetPresetRef, presetId)
  }, [])

  // ── Save draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async (vName = '', rNotes = '') => {
    if (!projectId) return
    setIsSaving(true); setSaveError(null)
    try {
      const snapshot = buildSnapshot(projectName, slides, cameraPresets)
      await saveDraft(projectId, snapshot, vName)
      setIsDirty(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }, [projectId, projectName, slides, cameraPresets])

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async (vName, rNotes) => {
    if (!projectId) return
    setIsSaving(true); setSaveError(null)
    try {
      const snapshot = buildSnapshot(projectName, slides, cameraPresets)
      const published = await publishVersion(projectId, snapshot, vName, rNotes)
      setPublishedVersion(published)
      setIsDirty(false)
      setShowPublish(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }, [projectId, projectName, slides, cameraPresets])

  // ── Feedback actions ──────────────────────────────────────────────────────
  const handleResolve = useCallback(async (itemId, newStatus) => {
    await setFeedbackStatus(itemId, newStatus)
    setSlideFeedback(prev => prev.map(f => f.id === itemId ? { ...f, status: newStatus } : f))
  }, [])

  const handleJumpToClip = useCallback((item) => {
    const slide = slides.find(s => s.id === item.slide_id)
    if (slide) {
      setActiveSlideId(slide.id)
      if (item.camera_snapshot_json?.name) {
        const preset = cameraPresets.find(p => p.name === item.camera_snapshot_json.name)
        if (preset) setCameraTargetPreset(cameraTargetPresetRef, preset.id)
      }
    }
  }, [slides, cameraPresets])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    revokeAllBlobs()
  }, [revokeAllBlobs])

  // ── Render ────────────────────────────────────────────────────────────────
  if (isDbLoading) return <BrandedLoadingScreen status="Loading presentation editor…" />
  if (projectNotFound) return (
    <div style={{ background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Chakra Petch, sans-serif' }}>
      Project not found.
    </div>
  )

  const versionLabel = publishedVersion
    ? `v${publishedVersion.version_number} · ${formatRelative(publishedVersion.published_at)}`
    : null

  return (
    <div style={{
      background: T.bg, color: T.text, height: '100vh',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Chakra Petch, sans-serif', overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ── Radial ambient ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 40% at 15% 100%, rgba(180,50,10,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 85% 0%, rgba(31,160,238,0.05) 0%, transparent 50%)',
      }} />

      {/* ── Top bar ── */}
      <div style={{
        height: 44, background: 'rgba(10,8,6,0.94)', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
        flexShrink: 0, backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
        boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
      }}>
        {/* Logo */}
        <div style={{
          width: 24, height: 24, borderRadius: 5, flexShrink: 0,
          background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'white',
          boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
        }}>SV</div>

        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>StageViz</span>

        <div style={{ width: 1, height: 22, background: 'rgba(220,100,30,0.22)' }} />

        <Col gap={1}>
          <span style={{ fontSize: 11, fontWeight: 500, color: T.text }}>{projectName}</span>
          <Row gap={6}>
            {publishedVersion && (
              <span style={{ fontSize: 9, color: T.text3 }}>
                Draft from Published v{publishedVersion.version_number}
              </span>
            )}
            {publishedVersion?.published_at && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.text4 }} />
                <span style={{ fontSize: 9, color: T.text3 }}>
                  Last published {formatRelative(publishedVersion.published_at)}
                </span>
              </>
            )}
          </Row>
        </Col>

        {isDirty && <StatusTag type="unsaved">● Unsaved changes</StatusTag>}

        <Spacer f={1} />

        {saveError && (
          <span style={{ fontSize: 10, color: T.ember, fontFamily: 'Chakra Petch, sans-serif' }}>
            {saveError}
          </span>
        )}

        <GhostBtn onClick={() => navigate(`/view/${projectId}`)}>👁 Preview as client</GhostBtn>
        <GhostBtn onClick={() => handleSaveDraft()} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save draft'}
        </GhostBtn>
        <EmberBtn onClick={() => setShowPublish(true)}>→ Publish</EmberBtn>
      </div>

      {/* ── 3-column body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* ── LEFT: Slide list ── */}
        <SlideList
          slides={slides.map(s => ({
            ...s,
            _feedbackCount: slideFeedback.filter(f => f.slide_id === s.id && f.status === 'pending').length,
          }))}
          activeSlideId={activeSlideId}
          onSelect={selectSlide}
          onAdd={addSlide}
          onReorder={reorderSlides}
        />

        {/* ── CENTER: Stage + transport ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}` }}>

          {/* Clip title bar */}
          <div style={{
            padding: '7px 14px', background: 'rgba(0,0,0,0.32)',
            borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{activeSlide?.title || '—'}</span>
            <span style={{ fontSize: 10, color: T.text3 }}>
              {activeSlide ? `Clip ${slides.indexOf(activeSlide) + 1} of ${slides.length}` : ''}
            </span>
            <Spacer f={1} />
            <Row gap={5}>
              {cameraPresets.map(p => (
                <CamPill
                  key={p.id}
                  label={p.name}
                  active={activePresetId === p.id}
                  onClick={() => selectCamera(p.id)}
                />
              ))}
            </Row>
            <div style={{ width: 1, height: 18, background: 'rgba(220,100,30,0.2)' }} />
            {/* More menu — placeholder */}
            <button style={{ background: 'none', border: 'none', color: T.text3, cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>⋯</button>
          </div>

          {/* Stage canvas */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#050404' }}>
            {/* Grid overlay */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'linear-gradient(rgba(232,83,26,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,83,26,0.04) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />

            {modelUrl ? (
              <StageCanvas
                modelUrl={modelUrl}
                videoElement={videoElement}
                activeImageUrl={activeImageUrl}
                sunPosition={sunPosition}
                sunIntensity={sunIntensity}
                gridCellSize={gridCellSize}
                modelLoaded={stageLoaded}
                cameraControlsRef={cameraControlsRef}
                cameraTargetPresetRef={cameraTargetPresetRef}
                cameraFlyDurationSeconds={4}
                loadingManager={loadingManager}
                hdriPreset="none"
                envIntensity={1}
                bgBlur={0}
                bloomStrength={0.3}
                bloomThreshold={1.2}
                protectLed
                transparentLedConfig={{ enabled: true, gridDensity: 36, gridDensityX: 36, gridDensityY: 36, barThickness: 0.08, barThicknessX: 0.08, barThicknessY: 0.08, glow: 1.4, opacity: 0.95 }}
                showHdriBackground={false}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: T.text4, fontSize: 11 }}>No stage model loaded</span>
              </div>
            )}

            {/* Active camera badge */}
            {activePresetId && (
              <div style={{
                position: 'absolute', top: 10, left: 12,
                background: T.camDim, border: '1px solid rgba(31,160,238,0.35)',
                borderRadius: 4, padding: '2px 7px',
                fontSize: 9, color: T.cam, fontWeight: 600, letterSpacing: '0.08em',
                boxShadow: T.camGlow,
              }}>
                ● CAM: {cameraPresets.find(p => p.id === activePresetId)?.name ?? activePresetId}
              </div>
            )}

            <div style={{ position: 'absolute', bottom: 12, left: 14, color: 'rgba(244,236,226,0.18)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              3D Stage Viewer · Presentation Editor
            </div>
          </div>

          {/* Transport bar */}
          <div style={{
            height: 38, background: 'rgba(5,4,3,0.95)', borderTop: `1px solid rgba(220,100,30,0.14)`,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', flexShrink: 0,
          }}>
            <span style={{ color: T.text2, fontSize: 12, cursor: 'pointer' }}>⏮</span>
            <span style={{ color: T.text, fontSize: 12, cursor: 'pointer' }}>▶</span>
            <span style={{ color: T.text2, fontSize: 12, cursor: 'pointer' }}>⏭</span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '0%', background: T.ember, borderRadius: 2 }} />
            </div>
            <span style={{ color: T.text2, fontSize: 10, fontFamily: 'Chakra Petch, sans-serif' }}>
              — / {activeSlide ? formatDuration(activeSlide.durationSeconds) : '—'}
            </span>
          </div>
        </div>

        {/* ── RIGHT: Context / Feedback panel ── */}
        <div style={{
          width: 268, flexShrink: 0,
          background: T.glassDark, backdropFilter: 'blur(14px)',
          borderLeft: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Tab switcher */}
          <div style={{ padding: '8px 10px', borderBottom: `1px solid rgba(220,100,30,0.1)`, display: 'flex', gap: 6, flexShrink: 0 }}>
            {[
              { id: 'context', label: 'Context' },
              { id: 'feedback', label: 'Feedback', badge: slideFeedback.filter(f => f.status === 'pending').length },
            ].map(tab => (
              <button key={tab.id} onClick={() => setRightTab(tab.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', fontSize: 10, fontWeight: rightTab === tab.id ? 600 : 500,
                borderRadius: 5, cursor: 'pointer',
                fontFamily: 'Chakra Petch, sans-serif', letterSpacing: '0.04em',
                background: rightTab === tab.id ? T.emberDim : 'transparent',
                border: `1px solid ${rightTab === tab.id ? T.ember : 'transparent'}`,
                color: rightTab === tab.id ? T.ember2 : T.text3,
              }}>
                {tab.label}
                {tab.badge > 0 && (
                  <span style={{ background: T.amber, borderRadius: 8, padding: '0 5px', fontSize: 8, color: '#1a0a00', fontWeight: 700 }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {rightTab === 'context' ? (
            <ContextPanel
              slide={activeSlide}
              cameraPresets={cameraPresets}
              onChange={updateActiveSlide}
              onDuplicate={duplicateSlide}
              onToggleHidden={toggleHidden}
              onDelete={deleteSlide}
            />
          ) : (
            <FeedbackPanel
              feedback={slideFeedback}
              slideName={activeSlide?.title}
              versionLabel={versionLabel}
              onResolve={handleResolve}
              onJumpToClip={handleJumpToClip}
              onOpenFullReview={() => navigate(`/admin/${projectId}/feedback`)}
            />
          )}
        </div>
      </div>

      {/* ── Publish modal ── */}
      {showPublish && (
        <PublishModal
          slides={slides}
          cameraPresets={cameraPresets}
          projectName={projectName}
          publishedVersionNumber={publishedVersion?.version_number ?? 0}
          onCancel={() => setShowPublish(false)}
          onSaveDraft={(vName, rNotes) => { handleSaveDraft(vName, rNotes); setShowPublish(false) }}
          onPublish={handlePublish}
          saving={isSaving}
        />
      )}
    </div>
  )
}

// ── Small icon components ─────────────────────────────────────────────────────
function DragIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
      <circle cx="3" cy="2.5" r="1" fill="currentColor" />
      <circle cx="7" cy="2.5" r="1" fill="currentColor" />
      <circle cx="3" cy="6"   r="1" fill="currentColor" />
      <circle cx="7" cy="6"   r="1" fill="currentColor" />
      <circle cx="3" cy="9.5" r="1" fill="currentColor" />
      <circle cx="7" cy="9.5" r="1" fill="currentColor" />
    </svg>
  )
}
function EyeIcon({ color = 'currentColor' }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1 5.5s1.6-3 4.5-3 4.5 3 4.5 3-1.6 3-4.5 3-4.5-3-4.5-3z" stroke={color} strokeWidth="1.1" fill="none" />
      <circle cx="5.5" cy="5.5" r="1.3" fill={color} />
    </svg>
  )
}
function EyeOffIcon({ color = 'currentColor' }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1 5.5s1.6-3 4.5-3 4.5 3 4.5 3-1.6 3-4.5 3-4.5-3-4.5-3z" stroke={color} strokeWidth="1.1" fill="none" />
      <line x1="1" y1="10" x2="10" y2="1" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

function Avatar({ name = '', size = 22 }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #B04018, #4A2010)',
      border: '1px solid rgba(232,83,26,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.ember2, fontSize: Math.max(8, size * 0.4), fontWeight: 700,
      fontFamily: 'Chakra Petch, sans-serif',
    }}>
      {initials}
    </div>
  )
}

// ── Ref row component ─────────────────────────────────────────────────────────
function RefRow({ ref_, onChange, onDelete }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid rgba(220,100,30,0.12)`, borderRadius: 7, padding: '8px 10px' }}>
      <Row gap={8} align="flex-start">
        {/* Thumbnail placeholder */}
        <div style={{
          width: 56, height: 38, borderRadius: 5, flexShrink: 0,
          background: '#1a1410', border: `1px solid rgba(220,100,30,0.15)`,
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(220,100,30,0.05) 4px, rgba(220,100,30,0.05) 5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 8, color: T.text3 }}>ref img</span>
        </div>
        <Col gap={5} style={{ flex: 1, minWidth: 0 }}>
          <TextInput value={ref_.caption} onChange={v => onChange({ ...ref_, caption: v })} placeholder="Caption…" />
          <Row gap={6}>
            <button
              onClick={() => onChange({ ...ref_, visibleToClient: !ref_.visibleToClient })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px',
                borderRadius: 4, cursor: 'pointer', border: 'none',
                background: ref_.visibleToClient ? 'rgba(43,199,130,0.1)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1, borderStyle: 'solid',
                borderColor: ref_.visibleToClient ? 'rgba(43,199,130,0.3)' : 'rgba(255,255,255,0.1)',
              }}
            >
              {ref_.visibleToClient
                ? <EyeIcon color={T.green} />
                : <EyeOffIcon color={T.text3} />}
              <span style={{ fontSize: 9, color: ref_.visibleToClient ? T.green : T.text3, fontFamily: 'Chakra Petch, sans-serif' }}>
                {ref_.visibleToClient ? 'Client visible' : 'Hidden'}
              </span>
            </button>
            <Spacer f={1} />
            <GhostBtn style={{ padding: '2px 7px', fontSize: 9 }} danger onClick={onDelete}>✕</GhostBtn>
          </Row>
        </Col>
      </Row>
    </div>
  )
}

// ── Text input ────────────────────────────────────────────────────────────────
function TextInput({ value, onChange, placeholder, multiline = false, rows = 2 }) {
  const [focused, setFocused] = useState(false)
  const style = {
    width: '100%', background: 'rgba(0,0,0,0.35)',
    border: `1px solid ${focused ? 'rgba(220,100,30,0.32)' : 'rgba(220,100,30,0.18)'}`,
    borderRadius: 6, padding: '6px 9px',
    fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, color: value ? T.text : T.text3,
    outline: 'none', lineHeight: 1.4, resize: 'vertical',
    boxShadow: focused ? '0 0 0 2px rgba(232,83,26,0.12)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const handlers = {
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
    onChange: e => onChange(e.target.value),
  }
  if (multiline) return <textarea value={value} placeholder={placeholder} rows={rows} style={style} {...handlers} />
  return <input type="text" value={value} placeholder={placeholder} style={style} {...handlers} />
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function makeSlideFromClip(clip, index, cameraPresets = []) {
  return {
    id:                   `slide_${clip.id ?? index}`,
    clipId:               clip.id ?? String(index),
    title:                clip.name ?? `Clip ${index + 1}`,
    subtitle:             '',
    directorNote:         '',
    directorNoteVisible:  true,
    defaultCameraPresetId: cameraPresets[0]?.id ?? '',
    hiddenFromClient:     false,
    durationSeconds:      0,
    references:           [],
    sortOrder:            index + 1,
  }
}

function makeBlankSlide(index) {
  return {
    id:                   `slide_${Date.now()}`,
    clipId:               '',
    title:                '',
    subtitle:             '',
    directorNote:         '',
    directorNoteVisible:  true,
    defaultCameraPresetId: '',
    hiddenFromClient:     false,
    durationSeconds:      0,
    references:           [],
    sortOrder:            index + 1,
  }
}

function newRef() {
  return { id: `ref_${Date.now()}`, type: 'image', url: '', caption: '', visibleToClient: true, sortOrder: 0 }
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function formatTimecode(seconds) {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 60)    return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24)   return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatRelative(ts) {
  if (!ts) return ''
  return timeAgo(ts)
}

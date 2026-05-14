import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import { supabase } from '../lib/supabaseClient'
import {
  deleteFeedback,
  deleteVersion,
  discardDraft,
  loadDraft,
  loadAllVersions,
  loadPublishedVersion,
  pruneArchivedVersions,
  renameVersion,
  restoreVersion,
  revertDraftToPublished,
  saveDraft,
  publishVersion,
  loadFeedback,
  setFeedbackStatus,
  buildSnapshot,
  snapshotSummary,
  slidePublishChecklist,
  VersionConflictError,
} from '../lib/presentationVersions'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
import { fetchAndCacheAsset, fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { getPresignedUploadUrl, uploadFileToPresignedUrl, getUploadErrorMessage } from '../utils/r2Upload'
import { uploadClipThumbnail } from '../utils/clipThumbnails'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import { useStageLoading } from '../hooks/useStageLoading'
import { useBlobUrlCache } from '../hooks/useBlobUrlCache'
import VersionHistoryDrawer from '../features/presentation/components/VersionHistoryDrawer'
import { DirectorNotesEditor } from '../features/presentation/components/DirectorNotesEditor'
import { AnnotationModeTopBar } from '../features/presentation/components/AnnotationModeOverlay'
import { AnnotationLayer, AnnotationToolbar, StageLockBanner } from '../components/FeedbackDraftPanel'

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
function GhostBtn({ children, style = {}, onClick, onAuxClick, danger = false, disabled = false }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onAuxClick={onAuxClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em',
        transition: 'all 0.15s',
        background: hov && !disabled ? T.glass2 : T.glass,
        border: `1px solid ${danger ? 'rgba(232,83,26,0.3)' : (hov && !disabled ? T.border2 : T.border)}`,
        color: danger ? 'rgba(232,83,26,0.8)' : (hov && !disabled ? T.text : T.text2),
        opacity: disabled ? 0.55 : 1,
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
function ClipThumbnail({ src, active, width = 46, height = 30, radius = 5 }) {
  return (
    <div style={{
      width, height, borderRadius: radius, flexShrink: 0,
      background: '#1a1410',
      border: `1px solid ${active ? T.ember : 'rgba(220,100,30,0.15)'}`,
      boxShadow: active ? '0 0 10px rgba(232,83,26,0.3)' : 'none',
      backgroundImage: src
        ? `url("${src}")`
        : 'repeating-linear-gradient(135deg, #1a1410 0px, #1a1410 3px, #201810 3px, #201810 9px)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      overflow: 'hidden',
    }} />
  )
}

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

              <ClipThumbnail src={slide.thumbnailUrl || slide.thumbnail_url} active={isActive} />

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
function ContextPanel({ slide, cameraPresets, onChange, onDuplicate, onToggleHidden, onDelete, projectId, onEditAnnotation }) {
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

        {/* Director's Notes */}
        <DirectorNotesEditor
          notes={slide.directorNotes ?? []}
          cameraPresets={cameraPresets}
          defaultCameraPresetId={slide.defaultCameraPresetId ?? ''}
          onChange={notes => onChange({ directorNotes: notes })}
          onEditAnnotation={onEditAnnotation ?? (() => {})}
        />

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
              projectId={projectId}
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
function FeedbackPanel({ feedback, slideName, versionLabel, onResolve, onDelete, onJumpToClip, onOpenFullReview, highlightFeedbackId }) {
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
              highlight={item.id === highlightFeedbackId}
              onResolve={() => onResolve(item.id, item.status === 'pending' ? 'resolved' : 'pending')}
              onDelete={() => onDelete(item)}
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

function FeedbackCard({ item, onResolve, onDelete, onJump, highlight = false }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: highlight ? 'rgba(31,160,238,0.07)' : (hov ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.28)'),
        border: `1px solid ${highlight ? 'rgba(31,160,238,0.45)' : (hov ? T.border2 : 'rgba(220,100,30,0.1)')}`,
        boxShadow: highlight ? '0 0 0 2px rgba(31,160,238,0.12)' : 'none',
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
        <GhostBtn danger style={{ padding: '2px 8px', fontSize: 9 }} onClick={onDelete}>
          Delete
        </GhostBtn>
      </Row>
    </div>
  )
}

// ── Publish Modal ─────────────────────────────────────────────────────────────
function PublishModal({ slides, cameraPresets, projectName, draftVersionNumber, publishedVersionNumber, onCancel, onSaveDraft, onPublish, saving }) {
  const [versionName, setVersionName] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')

  const snapshot  = buildSnapshot(projectName, slides, cameraPresets)
  const summary   = snapshotSummary(snapshot)
  const nextNum   = draftVersionNumber ?? ((publishedVersionNumber ?? 0) + 1)
  const hasCenterPreset = cameraPresets.some(p => String(p?.name ?? '').toLowerCase() === 'center')

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
            {!hasCenterPreset && (
              <div style={{
                background: 'rgba(232,149,24,0.10)',
                border: '1px solid rgba(232,149,24,0.45)',
                borderRadius: 8,
                padding: '9px 11px',
              }}>
                <span style={{ fontSize: 10, color: T.amber, lineHeight: 1.5, display: 'block', fontFamily: 'Chakra Petch, sans-serif' }}>
                  Publish checklist: missing required camera preset <b>Center</b>. Add a preset named "Center" to guarantee Feedback mode locks to the expected camera.
                </span>
              </div>
            )}
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
  const [searchParams] = useSearchParams()
  const jumpSlideId    = searchParams.get('slideId')
  const jumpFeedbackId = searchParams.get('feedbackId')
  // Freeze at mount — không để thay đổi URL retrigger load effect
  const jumpTargetRef  = useRef({ slideId: jumpSlideId, feedbackId: jumpFeedbackId })
  const seekApplied    = useRef(false)

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
  const thumbnailQueueRef = useRef(new Set())

  const [sunPosition,   setSunPosition]   = useState([10.6, 10.6, 7.5])
  const [sunIntensity,  setSunIntensity]  = useState(1)
  const [gridCellSize,  setGridCellSize]  = useState(1)
  const [hdriPreset,    setHdriPreset]    = useState('none')
  const [customHdriUrl, setCustomHdriUrl] = useState(null)
  const [hdriFileExt,   setHdriFileExt]   = useState('hdr')
  const [envIntensity,  setEnvIntensity]  = useState(1)
  const [bgBlur,        setBgBlur]        = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength, setBloomStrength] = useState(0.3)
  const [bloomThreshold, setBloomThreshold] = useState(1.2)
  const [protectLed,    setProtectLed]    = useState(true)
  const [transparentLedConfig, setTransparentLedConfig] = useState({
    enabled: true, gridDensity: 36, gridDensityX: 36, gridDensityY: 36,
    barThickness: 0.08, barThicknessX: 0.08, barThicknessY: 0.08, glow: 1.4, opacity: 0.95,
  })

  const { loadingManager, loaded: stageLoaded, reset: resetStageLoading } = useStageLoading()
  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()

  // ── Video playlist → slides ───────────────────────────────────────────────
  const [videoPlaylist, setVideoPlaylist] = useState([])   // raw DB playlist
  const videoPlaylistRef = useRef([])
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [currentTime,   setCurrentTime]   = useState(0)
  const [activeDuration, setActiveDuration] = useState(0)
  const videoRef = useRef(null)
  const activationSeqRef = useRef(0)

  // ── Presentation editor state ─────────────────────────────────────────────
  const [slides,          setSlides]          = useState([])
  const [activeSlideId,   setActiveSlideId]   = useState(null)
  const [rightTab,        setRightTab]        = useState('context')  // 'context' | 'feedback'
  const [isDirty,         setIsDirty]         = useState(false)
  const [isSaving,        setIsSaving]        = useState(false)
  const [saveError,       setSaveError]       = useState(null)
  const [showPublish,     setShowPublish]      = useState(false)
  const [showHistory,     setShowHistory]      = useState(false)
  const [draftVersion,    setDraftVersion]     = useState(null)
  const [publishedVersion, setPublishedVersion] = useState(null)  // latest published
  const [versionConflict, setVersionConflict]  = useState(null)
  const [adminIdentity,   setAdminIdentity]    = useState('')

  // ── Annotation mode (admin drawing annotation for a director note) ─────────
  const [annotatingNoteId,    setAnnotatingNoteId]    = useState(null)
  const [annotTempAnnotation, setAnnotTempAnnotation] = useState(null)
  const [annotTool,           setAnnotTool]           = useState(null)

  // ── Feedback for active slide ─────────────────────────────────────────────
  const [slideFeedback, setSlideFeedback] = useState([])

  // ── Loading ───────────────────────────────────────────────────────────────
  const [isDbLoading, setIsDbLoading] = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)

  const activeSlide = slides.find(s => s.id === activeSlideId) ?? null
  const isVersionConflict = useCallback((err) => (
    err instanceof VersionConflictError || err?.name === 'VersionConflictError'
  ), [])

  useEffect(() => {
    videoPlaylistRef.current = videoPlaylist
  }, [videoPlaylist])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return
        const user = data?.session?.user
        setAdminIdentity(user?.email || user?.user_metadata?.full_name || user?.id || '')
      })
      .catch(() => {})

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setAdminIdentity(user?.email || user?.user_metadata?.full_name || user?.id || '')
    })

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  const persistProjectPlaylistThumbnail = useCallback(async (slide, slideIndex, thumbnailUrl) => {
    const currentPlaylist = videoPlaylistRef.current
    if (!projectId || !isPersistedThumbnailUrl(thumbnailUrl) || !currentPlaylist.length) return

    const clipIndex = currentPlaylist.findIndex(c =>
      String(c.id) === String(slide.clipId) || c.name === slide.clipId
    )
    const targetIndex = clipIndex >= 0 ? clipIndex : slideIndex
    if (targetIndex < 0 || targetIndex >= currentPlaylist.length) return

    const currentClip = currentPlaylist[targetIndex]
    if (currentClip?.thumbnailUrl === thumbnailUrl || currentClip?.thumbnail_url === thumbnailUrl) return

    const nextPlaylist = currentPlaylist.map((clip, i) => (
      i === targetIndex ? { ...clip, thumbnailUrl } : clip
    ))
    videoPlaylistRef.current = nextPlaylist
    setVideoPlaylist(nextPlaylist)

    const { error } = await supabase
      .from('projects')
      .update({ media_playlist: nextPlaylist })
      .eq('id', projectId)

    if (error) throw error
  }, [projectId])

  const persistDraftThumbnail = useCallback(async (sourceSlides, slideId, thumbnailUrl) => {
    if (!projectId || !isPersistedThumbnailUrl(thumbnailUrl)) return sourceSlides

    const nextSlides = sourceSlides.map(s => (
      s.id === slideId ? { ...s, thumbnailUrl } : s
    ))
    const snapshot = buildSnapshot(projectName, nextSlides, cameraPresets)
    const savedDraft = await saveDraft(projectId, snapshot, {
      expectedToken: draftVersion?.version_token ?? null,
      createdBy: adminIdentity,
    })
    setDraftVersion(savedDraft)
    return nextSlides
  }, [adminIdentity, cameraPresets, draftVersion?.version_token, projectId, projectName])

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
        setGridCellSize(p.grid_cell_size ?? 1)

        // Restore scene_config — HDRI, lighting, post-FX
        const cfg = p.scene_config
        if (cfg) {
          setHdriPreset(cfg.hdriPreset ?? 'none')
          setEnvIntensity(cfg.envIntensity ?? 1)
          setBgBlur(cfg.bgBlur ?? 0)
          setShowHdriBackground(cfg.showHdriBackground ?? false)
          setBloomStrength(cfg.bloomStrength ?? 0.3)
          setBloomThreshold(cfg.bloomThreshold ?? 1.2)
          setProtectLed(cfg.protectLed ?? true)
          setTransparentLedConfig(prev => ({ ...prev, ...(cfg.transparentLedConfig || cfg.transparentLed || {}) }))
          if (cfg.sunPosition?.length) setSunPosition(cfg.sunPosition)
          if (cfg.sunIntensity != null) setSunIntensity(cfg.sunIntensity)
          if (cfg.customHdriUrl) {
            const hdriSrc = cfg.customHdriUrl.replace('visual.tooawake.online', 'visual.tooawake.mov')
            const ext = (hdriSrc.split('?')[0].split('.').pop() || 'hdr').toLowerCase()
            setHdriFileExt(['hdr', 'exr'].includes(ext) ? ext : 'hdr')
            fetchAsBlobUrlWithCache(hdriSrc)
              .then(b => { addBlob(b); setCustomHdriUrl(b) })
              .catch(() => {})
          }
        }

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
        setDraftVersion(draft)
        setPublishedVersion(published)

        let slidesData
        if (draft?.snapshot_json?.slides?.length) {
          slidesData = draft.snapshot_json.slides
        } else {
          slidesData = playlist.map((clip, i) => makeSlideFromClip(clip, i, p.camera_presets))
        }
        setSlides(slidesData)

        // Determine initial slide — prefer jump target over first
        const { slideId: jumpTarget } = jumpTargetRef.current
        const targetSlide   = jumpTarget ? slidesData.find(s => s.id === jumpTarget) : null
        const initialSlide  = targetSlide ?? slidesData[0]
        if (initialSlide) setActiveSlideId(initialSlide.id)
        if (targetSlide)  setRightTab('feedback')

        // Activate exactly ONE clip (the jump target's clip, or first)
        const initialIdx  = slidesData.indexOf(initialSlide)
        const initialClip = initialSlide
          ? (playlist.find(c =>
              String(c.id) === String(initialSlide.clipId) ||
              c.name === initialSlide.clipId
            ) ?? playlist[initialIdx >= 0 ? initialIdx : 0])
          : playlist[0]
        if (initialClip) activatePlaylistClip(initialClip)
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

    const slideIdx = slides.findIndex(s => s.id === activeSlideId)
    const clip = videoPlaylist.find(c =>
      String(c.id) === String(activeSlide.clipId) || c.name === activeSlide.clipId
    ) ?? videoPlaylist[slideIdx]
    if (clip) activatePlaylistClip(clip)

    if (activeSlide.defaultCameraPresetId) {
      setActivePresetId(activeSlide.defaultCameraPresetId)
      const preset = findPreset(cameraPresets, activeSlide.defaultCameraPresetId)
      if (preset) setCameraTargetPreset(cameraTargetPresetRef, preset)
    }

    if (projectId) {
      loadFeedback(projectId, { slideId: activeSlide.id })
        .then(setSlideFeedback)
        .catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlideId, projectId])

  useEffect(() => {
    if (!projectId || !slides.length || !videoPlaylist.length) return

    let cancelled = false
    async function generateMissingThumbnails() {
      let nextSlides = slides
      for (const slide of slides) {
        if (cancelled) return
        if (isPersistedThumbnailUrl(slide.thumbnailUrl || slide.thumbnail_url)) continue
        if (thumbnailQueueRef.current.has(slide.id)) continue

        const slideIdx = slides.findIndex(s => s.id === slide.id)
        const clip = videoPlaylist.find(c =>
          String(c.id) === String(slide.clipId) || c.name === slide.clipId
        ) ?? videoPlaylist[slideIdx]
        if (!clip?.url) continue

        thumbnailQueueRef.current.add(slide.id)
        try {
          const thumbnailUrl = await uploadClipThumbnail({
            clip,
            projectId,
            onLocalUrl: (localUrl) => {
              if (cancelled || !localUrl) return
              addBlob(localUrl)
              setSlides(prev => prev.map(s => (
                s.id === slide.id ? { ...s, thumbnailUrl: localUrl } : s
              )))
            },
          })
          if (cancelled || !thumbnailUrl) continue
          setSlides(prev => prev.map(s => (
            s.id === slide.id ? { ...s, thumbnailUrl } : s
          )))
          if (isPersistedThumbnailUrl(thumbnailUrl)) {
            await persistProjectPlaylistThumbnail(slide, slideIdx, thumbnailUrl)
            nextSlides = await persistDraftThumbnail(nextSlides, slide.id, thumbnailUrl)
            if (!cancelled) setSlides(nextSlides)
          }
        } catch (err) {
          console.warn('[PresentationEditor] thumbnail failed', clip?.name || clip?.id, err)
        } finally {
          thumbnailQueueRef.current.delete(slide.id)
        }
      }
    }

    generateMissingThumbnails()
    return () => { cancelled = true }
  }, [persistDraftThumbnail, persistProjectPlaylistThumbnail, projectId, slides.length, videoPlaylist.length])

  // ── Video activation ──────────────────────────────────────────────────────
  const activatePlaylistClip = useCallback(async (clip) => {
    if (!clip?.url) return
    const activationSeq = ++activationSeqRef.current
    setCurrentTime(0)
    setActiveDuration(0)
    setIsPlaying(false)
    const isRemote = clip.url.startsWith('http://') || clip.url.startsWith('https://')
    let url = clip.url
    try {
      if (isRemote) {
        const blobUrl = await fetchAsBlobUrlWithCache(clip.url)
        addBlob(blobUrl)
        url = blobUrl
      }
    } catch { url = clip.url }

    if (clip.type === 'image') {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
      }
      setActiveImageUrl(url)
      setVideoElement(null)
      setVideoLoaded(true)
    } else {
      setActiveImageUrl(null)
      if (!videoRef.current) videoRef.current = document.createElement('video')
      const vid = videoRef.current
      vid.pause()
      vid.src = url
      vid.loop = true
      vid.muted = true
      vid.playsInline = true
      vid.preload = 'auto'
      vid.onloadeddata = () => {
        if (activationSeq !== activationSeqRef.current) return
        setVideoLoaded(true)
        setVideoElement(vid)
        setActiveDuration(Number.isFinite(vid.duration) ? vid.duration : 0)
        vid.play().catch(() => {})
      }
      vid.onerror = () => {
        if (activationSeq !== activationSeqRef.current) return
        setVideoLoaded(false)
        setIsPlaying(false)
      }
      vid.ontimeupdate = () => setCurrentTime(vid.currentTime || 0)
      vid.ondurationchange = () => setActiveDuration(Number.isFinite(vid.duration) ? vid.duration : 0)
      vid.onplay = () => setIsPlaying(true)
      vid.onpause = () => setIsPlaying(false)
      vid.onended = () => setIsPlaying(false)
      vid.load()
    }
  }, [addBlob])

  const handlePlay = useCallback(() => {
    const vid = videoRef.current
    if (!vid || activeImageUrl) return
    vid.play().catch(() => {})
  }, [activeImageUrl])

  const handlePause = useCallback(() => {
    videoRef.current?.pause()
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

  // ── Annotation mode ───────────────────────────────────────────────────────
  const enterAnnotationMode = useCallback((noteId) => {
    const centerPreset = cameraPresets.find(p => p.name?.toLowerCase() === 'center')
    if (!centerPreset) return
    setActivePresetId(centerPreset.id)
    setCameraTargetPreset(cameraTargetPresetRef, centerPreset)
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = false
    setAnnotatingNoteId(noteId)
    // Pre-fill temp annotation with any existing annotation on the note
    const note = activeSlide?.directorNotes?.find(n => n.id === noteId)
    setAnnotTempAnnotation(note?.annotation ?? null)
    setAnnotTool(null)
  }, [cameraPresets, activeSlide])

  const exitAnnotationMode = useCallback(() => {
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = true
    setAnnotatingNoteId(null)
    setAnnotTempAnnotation(null)
    setAnnotTool(null)
  }, [])

  const saveAnnotation = useCallback(() => {
    if (!annotatingNoteId || !activeSlide) { exitAnnotationMode(); return }
    const clipTime = videoRef.current?.currentTime ?? null
    const centerPreset = cameraPresets.find(p => p.name?.toLowerCase() === 'center')
    const updatedNotes = (activeSlide.directorNotes ?? []).map(n =>
      n.id === annotatingNoteId
        ? { ...n, annotation: annotTempAnnotation, cameraPresetId: centerPreset?.id ?? n.cameraPresetId, clipTimeSeconds: clipTime, updatedAt: new Date().toISOString() }
        : n
    )
    updateActiveSlide({ directorNotes: updatedNotes })
    exitAnnotationMode()
  }, [annotatingNoteId, activeSlide, annotTempAnnotation, cameraPresets, updateActiveSlide, exitAnnotationMode])

  // ── Camera preset selection ───────────────────────────────────────────────
  const selectCamera = useCallback((presetId) => {
    const preset = findPreset(cameraPresets, presetId)
    if (!preset) return
    setActivePresetId(preset.id)
    setCameraTargetPreset(cameraTargetPresetRef, preset)
  }, [cameraPresets])

  const ensureSlideThumbnails = useCallback(async (sourceSlides) => {
    const nextSlides = [...sourceSlides]
    let changed = false

    for (let i = 0; i < nextSlides.length; i++) {
      const slide = nextSlides[i]
      if (isPersistedThumbnailUrl(slide.thumbnailUrl || slide.thumbnail_url)) continue

      const clip = videoPlaylist.find(c =>
        String(c.id) === String(slide.clipId) || c.name === slide.clipId
      ) ?? videoPlaylist[i]
      if (!clip?.url) continue

      try {
        const thumbnailUrl = await uploadClipThumbnail({
          clip,
          projectId,
          onLocalUrl: (localUrl) => {
            if (!localUrl) return
            addBlob(localUrl)
            setSlides(prev => prev.map(s => (
              s.id === slide.id ? { ...s, thumbnailUrl: localUrl } : s
            )))
          },
        })
        if (isPersistedThumbnailUrl(thumbnailUrl)) {
          nextSlides[i] = { ...slide, thumbnailUrl }
          changed = true
          await persistProjectPlaylistThumbnail(slide, i, thumbnailUrl)
          setSlides(prev => prev.map(s => (
            s.id === slide.id ? { ...s, thumbnailUrl } : s
          )))
        }
      } catch (err) {
        console.warn('[PresentationEditor] thumbnail upload before save failed', clip?.name || clip?.id, err)
      }
    }

    return changed ? nextSlides : sourceSlides
  }, [addBlob, persistProjectPlaylistThumbnail, projectId, videoPlaylist])

  // ── Save draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async (vName = '', rNotes = '', opts = {}) => {
    if (!projectId) return
    const force = !!opts.force
    setIsSaving(true); setSaveError(null); setVersionConflict(null)
    try {
      const slidesWithThumbnails = await ensureSlideThumbnails(slides)
      const snapshot = buildSnapshot(projectName, slidesWithThumbnails, cameraPresets)
      const savedDraft = await saveDraft(projectId, snapshot, {
        versionName: vName,
        releaseNotes: rNotes,
        expectedToken: force ? null : (draftVersion?.version_token ?? null),
        createdBy: adminIdentity,
      })
      setDraftVersion(savedDraft)
      setIsDirty(false)
    } catch (err) {
      if (isVersionConflict(err)) {
        setVersionConflict({ action: 'save', currentVersion: err.currentVersion, versionName: vName, releaseNotes: rNotes })
        setSaveError(null)
      } else {
        setSaveError(err.message)
      }
    } finally {
      setIsSaving(false)
    }
  }, [adminIdentity, cameraPresets, draftVersion?.version_token, ensureSlideThumbnails, isVersionConflict, projectId, projectName, slides])

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async (vName, rNotes, opts = {}) => {
    if (!projectId) return
    const force = !!opts.force
    setIsSaving(true); setSaveError(null); setVersionConflict(null)
    try {
      const slidesWithThumbnails = await ensureSlideThumbnails(slides)
      const snapshot = buildSnapshot(projectName, slidesWithThumbnails, cameraPresets)
      const published = await publishVersion(projectId, snapshot, {
        versionName: vName,
        releaseNotes: rNotes,
        expectedToken: force ? null : (draftVersion?.version_token ?? null),
        publishedBy: adminIdentity,
        createdBy: adminIdentity,
      })
      setPublishedVersion(published)
      setDraftVersion(null)
      setIsDirty(false)
      setShowPublish(false)
    } catch (err) {
      if (isVersionConflict(err)) {
        setVersionConflict({ action: 'publish', currentVersion: err.currentVersion, versionName: vName, releaseNotes: rNotes })
        setSaveError(null)
      } else {
        setSaveError(err.message)
      }
    } finally {
      setIsSaving(false)
    }
  }, [adminIdentity, cameraPresets, draftVersion?.version_token, ensureSlideThumbnails, isVersionConflict, projectId, projectName, slides])

  const handleReloadConflictDraft = useCallback(() => {
    const current = versionConflict?.currentVersion
    if (!current?.snapshot_json) return
    const snapshot = current.snapshot_json
    if (Array.isArray(snapshot.slides)) setSlides(snapshot.slides)
    if (Array.isArray(snapshot.cameraPresets)) setCameraPresets(snapshot.cameraPresets)
    if (snapshot.projectName) setProjectName(snapshot.projectName)
    setDraftVersion(current)
    setIsDirty(false)
    setVersionConflict(null)
    setSaveError(null)
  }, [versionConflict])

  const handleOverwriteConflictDraft = useCallback(() => {
    if (!versionConflict) return
    const { action, versionName, releaseNotes } = versionConflict
    if (action === 'publish') {
      handlePublish(versionName, releaseNotes, { force: true })
    } else {
      handleSaveDraft(versionName, releaseNotes, { force: true })
    }
  }, [handlePublish, handleSaveDraft, versionConflict])

  const handleHistoryChanged = useCallback(() => {
    window.location.reload()
  }, [])

  const restoreVersionWithIdentity = useCallback((projectIdArg, sourceVersionId) => (
    restoreVersion(projectIdArg, sourceVersionId, { createdBy: adminIdentity })
  ), [adminIdentity])

  const openClientPreview = useCallback(() => {
    window.open(`/view/${projectId}`, '_blank', 'noopener,noreferrer')
  }, [projectId])

  const handlePreviewAuxClick = useCallback((event) => {
    if (event.button !== 1) return
    event.preventDefault()
    openClientPreview()
  }, [openClientPreview])

  // ── Seek + camera restore after feedback loads (from jump link) ─────────
  useEffect(() => {
    if (!jumpFeedbackId || seekApplied.current || !slideFeedback.length) return
    const item = slideFeedback.find(f => f.id === jumpFeedbackId)
    if (!item) return
    seekApplied.current = true
    if (item.clip_time_seconds != null && videoRef.current) {
      videoRef.current.currentTime = item.clip_time_seconds
    }
    if (item.camera_snapshot_json?.name) {
      const preset = findPreset(cameraPresets, item.camera_snapshot_json.name)
      if (preset) {
        setActivePresetId(preset.id)
        setCameraTargetPreset(cameraTargetPresetRef, preset)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideFeedback, jumpFeedbackId])

  // ── Feedback actions ──────────────────────────────────────────────────────
  const handleResolve = useCallback(async (itemId, newStatus) => {
    await setFeedbackStatus(itemId, newStatus)
    setSlideFeedback(prev => prev.map(f => f.id === itemId ? { ...f, status: newStatus } : f))
  }, [])

  const handleDeleteFeedback = useCallback(async (item) => {
    if (!item) return
    const label = item.comment ? `"${item.comment.slice(0, 80)}${item.comment.length > 80 ? '...' : ''}"` : 'this feedback'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    await deleteFeedback(item.id)
    setSlideFeedback(prev => prev.filter(f => f.id !== item.id))
  }, [])

  const handleJumpToClip = useCallback((item) => {
    const slide = slides.find(s => s.id === item.slide_id)
    if (slide) {
      setActiveSlideId(slide.id)
      if (item.camera_snapshot_json?.name) {
        const preset = cameraPresets.find(p => p.name === item.camera_snapshot_json.name)
        if (preset) setCameraTargetPreset(cameraTargetPresetRef, preset)
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
  const topBarStatus = isDirty
    ? { type: 'unsaved', label: 'Unsaved changes' }
    : draftVersion
      ? { type: 'pending', label: `Draft saved · ${formatRelative(draftVersion.updated_at ?? draftVersion.created_at)}` }
      : publishedVersion
        ? { type: 'draft', label: `On v${publishedVersion.version_number} · published ${formatRelative(publishedVersion.published_at)}` }
        : { type: 'draft', label: 'No draft' }
  const topBarButtonStyle = { padding: '6px 12px', fontSize: 12, minHeight: 30 }

  return (
    <div style={{
      background: T.bg, color: T.text, height: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Chakra Petch, sans-serif', overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ── Radial ambient ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 40% at 15% 100%, rgba(180,50,10,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 85% 0%, rgba(31,160,238,0.05) 0%, transparent 50%)',
      }} />

      {/* ── Annotation mode top bar (replaces main top bar) ── */}
      {annotatingNoteId && (
        <AnnotationModeTopBar
          noteIndex={(activeSlide?.directorNotes ?? []).findIndex(n => n.id === annotatingNoteId)}
          slideTitle={activeSlide?.title ?? ''}
          camName={cameraPresets.find(p => p.name?.toLowerCase() === 'center')?.name ?? 'Center'}
          clipTime={videoRef.current?.currentTime ?? null}
          onSave={saveAnnotation}
          onCancel={exitAnnotationMode}
        />
      )}
      {annotatingNoteId && (
        <StageLockBanner
          lockedCtx={{ slideTitle: activeSlide?.title ?? '', camName: 'Center', clipTime: null }}
          mode="annotation"
        />
      )}

      {/* ── Top bar ── */}
      <div style={{
        height: 48, background: 'rgba(10,8,6,0.94)', borderBottom: `1px solid ${T.border}`,
        display: annotatingNoteId ? 'none' : 'flex', alignItems: 'center', gap: 11, padding: '0 15px',
        flexShrink: 0, backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
        boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
      }}>
        {/* Logo */}
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'white',
          boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
        }}>SV</div>

        <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>StageViz</span>

        <div style={{ width: 1, height: 24, background: 'rgba(220,100,30,0.22)' }} />

        <Col gap={1}>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{projectName}</span>
          <Row gap={6}>
            {draftVersion && (
              <span style={{ fontSize: 10, color: T.text3 }}>
                Draft v{draftVersion.version_number}
              </span>
            )}
            {publishedVersion?.published_at && (
              <>
                {draftVersion && <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.text4 }} />}
                <span style={{ fontSize: 10, color: T.text3 }}>
                  Last published {formatRelative(publishedVersion.published_at)}
                </span>
              </>
            )}
          </Row>
        </Col>

        <StatusTag type={topBarStatus.type}>{topBarStatus.label}</StatusTag>

        <Spacer f={1} />

        {saveError && (
          <span style={{ fontSize: 10, color: T.ember, fontFamily: 'Chakra Petch, sans-serif' }}>
            {saveError}
          </span>
        )}

        <GhostBtn
          style={topBarButtonStyle}
          onClick={openClientPreview}
          onAuxClick={handlePreviewAuxClick}
        >
          👁 Preview as client
        </GhostBtn>
        <GhostBtn style={topBarButtonStyle} onClick={() => navigate(`/admin/${projectId}/feedback`)}>💬 View Feedback</GhostBtn>
        <GhostBtn style={topBarButtonStyle} onClick={() => setShowHistory(true)}>History</GhostBtn>
        <GhostBtn style={topBarButtonStyle} onClick={() => handleSaveDraft()} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save draft'}
        </GhostBtn>
        <EmberBtn style={topBarButtonStyle} onClick={() => setShowPublish(true)}>→ Publish</EmberBtn>
      </div>

      {/* ── 3-column body ── */}
      {versionConflict && (
        <div style={{
          position: 'relative',
          zIndex: 9,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 15px',
          background: 'rgba(232,149,24,0.12)',
          borderBottom: '1px solid rgba(232,149,24,0.32)',
          color: T.text,
          fontFamily: 'Chakra Petch, sans-serif',
        }}>
          <span style={{ color: T.amber, fontSize: 12, fontWeight: 800 }}>Conflict</span>
          <span style={{ color: T.text2, fontSize: 11 }}>
            This draft was updated elsewhere. Your local edits are still open.
          </span>
          <Spacer f={1} />
          <GhostBtn style={{ ...topBarButtonStyle, minHeight: 28 }} onClick={handleReloadConflictDraft} disabled={isSaving}>
            Reload server version
          </GhostBtn>
          <EmberBtn style={{ ...topBarButtonStyle, minHeight: 28 }} onClick={handleOverwriteConflictDraft} disabled={isSaving}>
            Overwrite with my edits
          </EmberBtn>
        </div>
      )}

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
                onLedMaterialStatus={() => {}}
                sunPosition={sunPosition}
                sunIntensity={sunIntensity}
                gridCellSize={gridCellSize}
                modelLoaded={stageLoaded}
                cameraControlsRef={cameraControlsRef}
                cameraTargetPresetRef={cameraTargetPresetRef}
                cameraFlyDurationSeconds={1.5}
                loadingManager={loadingManager}
                hdriPreset={hdriPreset}
                customHdriUrl={customHdriUrl}
                hdriFileExt={hdriFileExt}
                onHdriLoading={() => {}}
                onHdriLoadError={() => {}}
                onHdriClearRequest={() => {}}
                envIntensity={envIntensity}
                bgBlur={bgBlur}
                showHdriBackground={showHdriBackground}
                bloomStrength={bloomStrength}
                bloomThreshold={bloomThreshold}
                protectLed={protectLed}
                transparentLedConfig={transparentLedConfig}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: T.text4, fontSize: 11 }}>No stage model loaded</span>
              </div>
            )}

            {/* Annotation mode overlays */}
            {annotatingNoteId && (
              <>
                <AnnotationLayer
                  annotation={annotTempAnnotation}
                  activeTool={annotTool}
                  onAnnotationChange={setAnnotTempAnnotation}
                />
                <AnnotationToolbar
                  activeTool={annotTool}
                  onToolChange={setAnnotTool}
                  onClear={() => { setAnnotTempAnnotation(null); setAnnotTool(null) }}
                  hasAnnotation={!!annotTempAnnotation}
                />
              </>
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
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={!!activeImageUrl || !videoElement}
              style={{
                background: 'none',
                border: 'none',
                color: activeImageUrl || !videoElement ? T.text4 : (isPlaying ? T.text2 : T.text),
                cursor: activeImageUrl || !videoElement ? 'default' : 'pointer',
                fontSize: 13,
                padding: 0,
                width: 18,
                height: 18,
                lineHeight: '18px',
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${activeDuration > 0 ? Math.min(100, (currentTime / activeDuration) * 100) : 0}%`,
                background: T.ember,
                borderRadius: 2,
              }} />
            </div>
            <span style={{ color: T.text2, fontSize: 10, fontFamily: 'Chakra Petch, sans-serif' }}>
              {formatDuration(currentTime)} / {formatDuration(activeDuration || activeSlide?.durationSeconds || 0)}
            </span>
          </div>
        </div>

        {/* ── RIGHT: Context / Feedback panel ── */}
        <div style={{
          width: 280, flexShrink: 0, zoom: 1.1,
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
              projectId={projectId}
              onEditAnnotation={enterAnnotationMode}
            />
          ) : (
            <FeedbackPanel
              feedback={slideFeedback}
              slideName={activeSlide?.title}
              versionLabel={versionLabel}
              onResolve={handleResolve}
              onDelete={handleDeleteFeedback}
              onJumpToClip={handleJumpToClip}
              onOpenFullReview={() => navigate(`/admin/${projectId}/feedback`)}
              highlightFeedbackId={jumpFeedbackId}
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
          draftVersionNumber={draftVersion?.version_number ?? null}
          publishedVersionNumber={publishedVersion?.version_number ?? 0}
          onCancel={() => setShowPublish(false)}
          onSaveDraft={(vName, rNotes) => { handleSaveDraft(vName, rNotes); setShowPublish(false) }}
          onPublish={handlePublish}
          saving={isSaving}
        />
      )}

      {showHistory && (
        <VersionHistoryDrawer
          projectId={projectId}
          projectName={projectName}
          loadAllVersions={loadAllVersions}
          loadFeedback={loadFeedback}
          discardDraft={discardDraft}
          restoreVersion={restoreVersionWithIdentity}
          revertDraftToPublished={revertDraftToPublished}
          renameVersion={renameVersion}
          deleteVersion={deleteVersion}
          pruneArchivedVersions={pruneArchivedVersions}
          onClose={() => setShowHistory(false)}
          onChanged={handleHistoryChanged}
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
const REF_ACCEPT = 'image/png,image/jpeg,image/gif'
const REF_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

function RefRow({ ref_, onChange, onDelete, projectId }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState(null)
  const inputRef = useRef(null)

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!REF_ALLOWED_TYPES.has(file.type)) {
      setError('Only PNG, JPG, GIF allowed')
      return
    }
    setUploading(true); setError(null); setProgress(0)
    try {
      const { putUrl, publicUrl } = await getPresignedUploadUrl({
        filename: file.name,
        contentType: file.type,
        projectId: projectId || undefined,
        type: 'media',
      })
      const finalUrl = await uploadFileToPresignedUrl(putUrl, file, publicUrl, setProgress)
      onChange({ ...ref_, url: finalUrl, type: 'image' })
    } catch (err) {
      setError(getUploadErrorMessage(err))
    } finally {
      setUploading(false); setProgress(0)
    }
  }

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid rgba(220,100,30,0.12)`, borderRadius: 7, padding: '8px 10px' }}>
      <Row gap={8} align="flex-start">
        {/* Thumbnail / upload trigger */}
        <div
          title={ref_.url ? 'Click to replace image' : 'Click to upload image'}
          onClick={() => !uploading && inputRef.current?.click()}
          style={{
            width: 56, height: 38, borderRadius: 5, flexShrink: 0,
            background: '#1a1410',
            border: `1px solid ${ref_.url ? 'rgba(220,100,30,0.4)' : 'rgba(220,100,30,0.15)'}`,
            cursor: uploading ? 'wait' : 'pointer',
            overflow: 'hidden', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {ref_.url ? (
            <img src={ref_.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : uploading ? (
            <span style={{ fontSize: 8, color: T.ember, fontFamily: 'Chakra Petch, sans-serif' }}>{progress}%</span>
          ) : (
            <>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(220,100,30,0.05) 4px, rgba(220,100,30,0.05) 5px)',
              }} />
              <span style={{ fontSize: 8, color: T.text3, position: 'relative' }}>+ img</span>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={REF_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        <Col gap={5} style={{ flex: 1, minWidth: 0 }}>
          <TextInput value={ref_.caption} onChange={v => onChange({ ...ref_, caption: v })} placeholder="Caption…" />
          {error && (
            <span style={{ fontSize: 9, color: '#e05555', fontFamily: 'Chakra Petch, sans-serif' }}>{error}</span>
          )}
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
    thumbnailUrl:          clip.thumbnailUrl || clip.thumbnail_url || '',
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
    thumbnailUrl:          '',
    references:           [],
    sortOrder:            index + 1,
  }
}

function newRef() {
  return { id: `ref_${Date.now()}`, type: 'image', url: '', caption: '', visibleToClient: true, sortOrder: 0 }
}

function isPersistedThumbnailUrl(url) {
  return Boolean(url && typeof url === 'string' && !url.startsWith('blob:'))
}

function findPreset(presets, presetIdOrName) {
  if (!Array.isArray(presets) || presetIdOrName == null) return null
  return (
    presets.find(p => String(p.id) === String(presetIdOrName)) ||
    presets.find(p => String(p.name).toLowerCase() === String(presetIdOrName).toLowerCase()) ||
    null
  )
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

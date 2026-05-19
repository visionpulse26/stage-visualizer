import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  deleteFeedback,
  loadAllVersions,
  loadFeedback,
  loadPublishedVersion,
  saveAdminNote,
  setFeedbackStatus,
} from '../lib/presentationVersions'

const T = {
  bg: '#080604',
  glass: 'rgba(255,255,255,0.045)',
  border: 'rgba(220,100,30,0.20)',
  border2: 'rgba(220,100,30,0.32)',
  ember: '#E8531A',
  ember2: '#FF6B2B',
  emberDim: 'rgba(232,83,26,0.15)',
  cam: '#1FA0EE',
  green: '#2BC782',
  amber: '#E89518',
  text: '#F4ECE2',
  text2: '#C8B8A8',
  text3: '#8E7E70',
  text4: '#5A4E45',
}

const Row = ({ children, gap = 6, align = 'center', style = {} }) => (
  <div style={{ display: 'flex', alignItems: align, gap, ...style }}>{children}</div>
)

const Col = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
)

function GhostBtn({ children, onClick, style = {}, disabled = false }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif',
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        transition: 'all 0.15s',
        background: hov && !disabled ? 'rgba(255,255,255,0.07)' : T.glass,
        border: `1px solid ${hov && !disabled ? T.border2 : 'rgba(255,255,255,0.10)'}`,
        color: hov && !disabled ? T.text : T.text2,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function PrimaryBtn({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '8px 16px',
        borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif',
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: T.ember2,
        border: `1px solid ${T.ember2}`,
        color: '#fff',
        boxShadow: '0 0 14px rgba(255,107,43,0.35)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}

function StatusTag({ status }) {
  const resolved = status === 'resolved'
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 4,
        fontFamily: 'Chakra Petch, sans-serif',
        background: resolved ? 'rgba(43,199,130,0.10)' : 'rgba(232,149,24,0.12)',
        border: `1px solid ${resolved ? 'rgba(43,199,130,0.45)' : 'rgba(232,149,24,0.55)'}`,
        color: resolved ? T.green : T.amber,
      }}
    >
      {status || 'pending'}
    </span>
  )
}

function VersionBadge({ version }) {
  if (!version) {
    return (
      <span style={{ ...versionBadgeStyle, color: T.text4, borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
        no version
      </span>
    )
  }

  const isPublished = version.status === 'published'
  return (
    <span style={{
      ...versionBadgeStyle,
      color: isPublished ? T.green : T.amber,
      borderColor: isPublished ? 'rgba(43,199,130,0.45)' : 'rgba(232,149,24,0.55)',
      background: isPublished ? 'rgba(43,199,130,0.08)' : 'rgba(232,149,24,0.10)',
    }}>
      v{version.version_number} {version.status}
    </span>
  )
}

function getVersionLabel(version) {
  if (!version) return 'No version'
  const name = version.version_name ? ` - ${version.version_name}` : ''
  return `v${version.version_number} ${version.status}${name}`
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
  const mins = Math.max(0, Math.floor(diff / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AdminFeedbackReviewPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const [projectName, setProjectName] = useState('Project')
  const [versionLabel, setVersionLabel] = useState('-')
  const [versions, setVersions] = useState([])
  const [items, setItems] = useState([])
  const [slideMeta, setSlideMeta] = useState(new Map())
  const [statusFilter, setStatusFilter] = useState('all')
  const [versionFilter, setVersionFilter] = useState('all')
  const [slideFilter, setSlideFilter] = useState('all')
  const [reviewerFilter, setReviewerFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [selectedId, setSelectedId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!projectId) return

    let mounted = true
    async function loadAll() {
      setIsLoading(true)
      setError(null)
      try {
        const [{ data: project }, published, allVersions, feedback] = await Promise.all([
          supabase
            .from('projects')
            .select('name, media_playlist')
            .eq('id', projectId)
            .maybeSingle(),
          loadPublishedVersion(projectId),
          loadAllVersions(projectId),
          loadFeedback(projectId),
        ])
        if (!mounted) return

        setProjectName(project?.name ?? 'Project')
        setVersionLabel(published ? `v${published.version_number}` : 'draft')
        setVersions(allVersions)
        setItems(feedback)
        setSelectedId(feedback[0]?.id ?? null)

        const nextMap = new Map()
        const slides = published?.snapshot_json?.slides ?? []
        for (const slide of slides) {
          nextMap.set(slide.id, {
            slideTitle: slide.title || slide.id,
            clipId: slide.clipId,
          })
        }

        const playlist = project?.media_playlist ?? []
        for (const clip of playlist) {
          nextMap.set(`clip:${clip.id}`, { clipName: clip.name ?? clip.id })
        }
        setSlideMeta(nextMap)
      } catch (e) {
        setError(e?.message ?? 'Failed to load feedback')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadAll()
    return () => { mounted = false }
  }, [projectId])

  const slideOptions = useMemo(() => {
    const set = new Map()
    for (const item of items) {
      if (!item.slide_id) continue
      const meta = slideMeta.get(item.slide_id)
      set.set(item.slide_id, meta?.slideTitle || item.slide_id)
    }
    return Array.from(set.entries()).map(([id, label]) => ({ id, label }))
  }, [items, slideMeta])

  const reviewerOptions = useMemo(() => {
    const all = new Set()
    for (const item of items) {
      if (item.reviewer_name) all.add(item.reviewer_name)
    }
    return Array.from(all).sort((a, b) => a.localeCompare(b))
  }, [items])

  const versionById = useMemo(() => {
    const map = new Map()
    for (const version of versions) map.set(version.id, version)
    return map
  }, [versions])

  const versionOptions = useMemo(() => {
    const idsWithFeedback = new Set(items.map(item => item.presentation_version_id).filter(Boolean))
    return versions
      .filter(version => idsWithFeedback.has(version.id))
      .map(version => ({ id: version.id, label: getVersionLabel(version) }))
  }, [items, versions])

  const filteredItems = useMemo(() => {
    const out = items.filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (versionFilter !== 'all' && (item.presentation_version_id || 'none') !== versionFilter) return false
      if (slideFilter !== 'all' && item.slide_id !== slideFilter) return false
      if (reviewerFilter !== 'all' && (item.reviewer_name || '') !== reviewerFilter) return false
      return true
    })
    out.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return sortOrder === 'newest' ? bt - at : at - bt
    })
    return out
  }, [items, reviewerFilter, slideFilter, sortOrder, statusFilter, versionFilter])

  const groupedItems = useMemo(() => {
    const groups = new Map()
    for (const item of filteredItems) {
      const key = item.slide_id || 'unknown'
      const title = slideMeta.get(item.slide_id)?.slideTitle || item.slide_id || 'Unknown slide'
      if (!groups.has(key)) groups.set(key, { key, title, items: [] })
      groups.get(key).items.push(item)
    }
    return Array.from(groups.values())
  }, [filteredItems, slideMeta])

  const pendingCount = items.filter(i => i.status === 'pending').length
  const resolvedCount = items.filter(i => i.status === 'resolved').length

  const selected = useMemo(
    () => items.find(i => i.id === selectedId) ?? null,
    [items, selectedId]
  )

  const selectedIndex = useMemo(
    () => filteredItems.findIndex(item => item.id === selectedId),
    [filteredItems, selectedId]
  )

  useEffect(() => {
    setNoteDraft(selected?.admin_note ?? '')
  }, [selectedId, selected?.admin_note])

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId(null)
      return
    }
    if (!filteredItems.some(item => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id)
    }
  }, [filteredItems, selectedId])

  const getClipLabel = useCallback((item) => {
    const meta = slideMeta.get(item.slide_id)
    if (meta?.slideTitle) return meta.slideTitle
    if (meta?.clipName) return meta.clipName
    if (meta?.clipId) return String(meta.clipId)
    return item.clip_id || 'Clip'
  }, [slideMeta])

  const toggleStatus = useCallback(async (item) => {
    const newStatus = item.status === 'pending' ? 'resolved' : 'pending'
    setIsUpdatingStatus(true)
    try {
      const updated = await setFeedbackStatus(item.id, newStatus)
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, ...updated } : i)))
    } catch (e) {
      setError(e?.message ?? 'Failed to update status')
    } finally {
      setIsUpdatingStatus(false)
    }
  }, [])

  const saveNote = useCallback(async () => {
    if (!selected) return
    setIsSavingNote(true)
    try {
      const updated = await saveAdminNote(selected.id, noteDraft)
      setItems(prev => prev.map(i => (i.id === selected.id ? { ...i, ...updated } : i)))
    } catch (e) {
      setError(e?.message ?? 'Failed to save note')
    } finally {
      setIsSavingNote(false)
    }
  }, [noteDraft, selected])

  const handleDelete = useCallback(async (item) => {
    if (!item) return
    const label = item.comment ? `"${item.comment.slice(0, 80)}${item.comment.length > 80 ? '...' : ''}"` : 'this feedback'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return

    setIsDeleting(true)
    setError(null)
    try {
      await deleteFeedback(item.id)
      const next = items.filter(i => i.id !== item.id)
      setItems(next)
      if (selectedId === item.id) setSelectedId(next[0]?.id ?? null)
    } catch (e) {
      setError(e?.message ?? 'Failed to delete feedback')
    } finally {
      setIsDeleting(false)
    }
  }, [items, selectedId])

  const selectRelative = useCallback((step) => {
    if (!filteredItems.length) return
    const current = selectedIndex >= 0 ? selectedIndex : 0
    const next = Math.max(0, Math.min(filteredItems.length - 1, current + step))
    setSelectedId(filteredItems[next]?.id ?? null)
  }, [filteredItems, selectedIndex])

  const handleJumpToSlide = useCallback((item) => {
    const version = versionById.get(item.presentation_version_id)
    if (version && version.status !== 'published') {
      const shouldPreview = window.confirm(
        `This feedback is on v${version.version_number} (${version.status}), which is not the live published version. Preview that version instead?`
      )
      if (shouldPreview) {
        window.open(`/view/${projectId}?versionId=${version.id}`, '_blank', 'noopener,noreferrer')
      }
      return
    }

    navigate(`/admin/${projectId}/presentation?slideId=${item.slide_id}&feedbackId=${item.id}`)
  }, [navigate, projectId, versionById])

  return (
    <div style={{ background: T.bg, color: T.text, height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Chakra Petch, sans-serif', overflow: 'hidden' }}>
      <TopBar
        projectName={projectName}
        versionLabel={versionLabel}
        pendingCount={pendingCount}
        resolvedCount={resolvedCount}
        onBack={() => navigate(`/admin/${projectId}/presentation`)}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <FilterRail
          itemsCount={items.length}
          pendingCount={pendingCount}
          resolvedCount={resolvedCount}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          slideFilter={slideFilter}
          setSlideFilter={setSlideFilter}
          slideOptions={slideOptions}
          versionFilter={versionFilter}
          setVersionFilter={setVersionFilter}
          versionOptions={versionOptions}
          reviewerFilter={reviewerFilter}
          setReviewerFilter={setReviewerFilter}
          reviewerOptions={reviewerOptions}
          versionLabel={versionLabel}
        />

        <FeedbackQueue
          groupedItems={groupedItems}
          filteredCount={filteredItems.length}
          pendingCount={pendingCount}
          selectedId={selectedId}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          isLoading={isLoading}
          getClipLabel={getClipLabel}
          versionById={versionById}
          onSelect={setSelectedId}
        />

        <DetailPane
          selected={selected}
          selectedIndex={selectedIndex}
          filteredCount={filteredItems.length}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          isSavingNote={isSavingNote}
          isUpdatingStatus={isUpdatingStatus}
          isDeleting={isDeleting}
          error={error}
          getClipLabel={getClipLabel}
          versionById={versionById}
          onPrev={() => selectRelative(-1)}
          onNext={() => selectRelative(1)}
          onSaveNote={saveNote}
          onToggleStatus={toggleStatus}
          onDelete={handleDelete}
          onJumpToSlide={handleJumpToSlide}
        />
      </div>
    </div>
  )
}

function TopBar({ projectName, versionLabel, pendingCount, resolvedCount, onBack }) {
  return (
    <div style={{ height: 44, background: '#0A0A0A', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', flexShrink: 0 }}>
      <LogoMark />
      <span style={{ fontSize: 13, fontWeight: 700 }}>StageViz</span>
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.10)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>{projectName}</span>
      <span style={{ fontSize: 10, color: T.text4 }}>-</span>
      <span style={{ fontSize: 11, color: T.text2 }}>Feedback Review</span>
      <VersionTag label={versionLabel} />
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: T.text3 }}>{pendingCount} open - {resolvedCount} resolved</span>
      <GhostBtn onClick={onBack}>{'<- Back to Editor'}</GhostBtn>
    </div>
  )
}

function FilterRail({
  itemsCount,
  pendingCount,
  resolvedCount,
  statusFilter,
  setStatusFilter,
  slideFilter,
  setSlideFilter,
  slideOptions,
  versionFilter,
  setVersionFilter,
  versionOptions,
  reviewerFilter,
  setReviewerFilter,
  reviewerOptions,
  versionLabel,
}) {
  return (
    <aside style={{ width: 220, borderRight: '1px solid rgba(255,255,255,0.08)', background: '#090909', padding: '20px 16px', flexShrink: 0 }}>
      <Col gap={18}>
        <span style={sectionLabelStyle}>Filter</span>
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
          <option value="all">All ({itemsCount})</option>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="resolved">Resolved ({resolvedCount})</option>
        </FilterSelect>
        <FilterSelect label="Slide" value={slideFilter} onChange={setSlideFilter}>
          <option value="all">All slides</option>
          {slideOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </FilterSelect>
        <FilterSelect label="Reviewer" value={reviewerFilter} onChange={setReviewerFilter}>
          <option value="all">All reviewers</option>
          {reviewerOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </FilterSelect>
        <FilterSelect label="Version" value={versionFilter} onChange={setVersionFilter}>
          <option value="all">All versions</option>
          <option value="none">No version</option>
          {versionOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </FilterSelect>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
        <Col gap={12}>
          <span style={sectionLabelStyle}>Quick stats</span>
          <StatRow color={T.ember2} label="Pending" value={pendingCount} />
          <StatRow color={T.text4} label="Resolved" value={resolvedCount} />
        </Col>
      </Col>
    </aside>
  )
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <Col gap={8}>
      <span style={filterLabelStyle}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
        {children}
      </select>
    </Col>
  )
}

function FeedbackQueue({
  groupedItems,
  filteredCount,
  pendingCount,
  selectedId,
  sortOrder,
  setSortOrder,
  isLoading,
  getClipLabel,
  versionById,
  onSelect,
}) {
  return (
    <main style={{ width: 440, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', minWidth: 360, background: '#0B0B0B' }}>
      <div style={{ padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#0D0D0D' }}>
        <Row gap={8}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>All Feedback</span>
          <span style={{ fontSize: 10, color: T.ember2, border: `1px solid ${T.ember}`, background: T.emberDim, borderRadius: 4, padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase' }}>{pendingCount} pending</span>
          <div style={{ flex: 1 }} />
          <GhostBtn onClick={() => setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'))} style={{ fontSize: 10, padding: '6px 10px', borderColor: 'rgba(255,255,255,0.10)' }}>
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'} v
          </GhostBtn>
        </Row>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && <div style={{ padding: 18, fontSize: 11, color: T.text3 }}>Loading feedback...</div>}
        {!isLoading && filteredCount === 0 && <div style={{ padding: 18, fontSize: 11, color: T.text4 }}>No feedback items with current filters.</div>}
        <Col gap={0}>
          {groupedItems.map(group => (
            <Col key={group.key} gap={0}>
              <Row gap={8} style={{ padding: '13px 18px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width: 3, height: 14, background: T.ember, borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 700 }}>{group.title}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{group.items.length} comment{group.items.length > 1 ? 's' : ''}</span>
              </Row>
              {group.items.map(item => (
                <FeedbackListItem
                  key={item.id}
                  item={item}
                  active={selectedId === item.id}
                  clipLabel={getClipLabel(item)}
                  version={versionById.get(item.presentation_version_id)}
                  onSelect={() => onSelect(item.id)}
                />
              ))}
            </Col>
          ))}
        </Col>
      </div>
    </main>
  )
}

function DetailPane({
  selected,
  selectedIndex,
  filteredCount,
  noteDraft,
  setNoteDraft,
  isSavingNote,
  isUpdatingStatus,
  isDeleting,
  error,
  getClipLabel,
  versionById,
  onPrev,
  onNext,
  onSaveNote,
  onToggleStatus,
  onDelete,
  onJumpToSlide,
}) {
  const selectedVersion = selected ? versionById.get(selected.presentation_version_id) : null

  return (
    <section style={{ flex: 1, background: '#0A0A0A', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ padding: '15px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={sectionLabelStyle}>Selected</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onPrev} disabled={selectedIndex <= 0} style={navBtnStyle}>{'<'}</button>
        <button type="button" onClick={onNext} disabled={selectedIndex < 0 || selectedIndex >= filteredCount - 1} style={navBtnStyle}>{'>'}</button>
        <span style={{ fontSize: 10, color: T.text3 }}>{selectedIndex >= 0 ? `${selectedIndex + 1} of ${filteredCount}` : `0 of ${filteredCount}`}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected && <div style={{ padding: 22, fontSize: 11, color: T.text4 }}>Select an item to review details.</div>}
        {selected && (
          <>
            {hasVisualAnnotation(selected) && (
              <div style={{ padding: '18px 22px 0' }}>
                <StageSnapshot
                  annotation={selected.annotation_json}
                  cameraName={selected.camera_snapshot_json?.name}
                  timecode={selected.clip_time_seconds != null ? formatTimecode(selected.clip_time_seconds) : null}
                />
              </div>
            )}

            <div style={{ padding: hasVisualAnnotation(selected) ? '18px 22px 0' : '22px 22px 0' }}>
              <Row gap={10} align="flex-start" style={{ marginBottom: 12 }}>
                <Avatar name={selected.reviewer_name} size={32} />
                <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Row gap={8}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{selected.reviewer_name || 'Reviewer'}</span>
                    <StatusTag status={selected.status} />
                    <VersionBadge version={selectedVersion} />
                  </Row>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo(selected.created_at)}</span>
                    <span style={detailMetaStyle}>{getClipLabel(selected)}</span>
                    {selected.camera_snapshot_json?.name && <span style={detailMetaStyle}>{selected.camera_snapshot_json.name}</span>}
                    {selected.clip_time_seconds != null && <span style={detailMetaStyle}>{formatTimecode(selected.clip_time_seconds)}</span>}
                    {!hasVisualAnnotation(selected) && <span style={detailMetaStyle}>Text-only</span>}
                  </Row>
                </Col>
              </Row>

              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.7, marginBottom: 16, whiteSpace: 'pre-wrap' }}>{selected.comment}</div>
              <Row gap={8} style={{ marginBottom: 18 }}>
                <PrimaryBtn onClick={() => onToggleStatus(selected)} disabled={isUpdatingStatus}>
                  {selected.status === 'pending' ? 'Resolve' : 'Reopen'}
                </PrimaryBtn>
                <GhostBtn
                  onClick={() => selected?.slide_id && onJumpToSlide?.(selected)}
                  disabled={!selected?.slide_id}
                  style={{ padding: '8px 14px' }}
                >
                  {selectedVersion && selectedVersion.status !== 'published' ? 'Preview version' : '<- Jump to slide'}
                </GhostBtn>
                <GhostBtn
                  onClick={() => onDelete?.(selected)}
                  disabled={isDeleting}
                  style={{ padding: '8px 14px', borderColor: 'rgba(232,83,26,0.35)', color: T.ember2 }}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </GhostBtn>
                <div style={{ flex: 1 }} />
                <span style={{ color: T.text3, fontSize: 18, lineHeight: 1 }}>...</span>
              </Row>
            </div>

            <div style={{ margin: '0 22px 22px', background: '#141414', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '16px 18px' }}>
              <Row gap={8} style={{ marginBottom: 10 }}>
                <span style={{ color: T.ember2, fontSize: 13 }}>▣</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>ADMIN NOTE</span>
                <span style={{ fontSize: 10, color: T.text3 }}>internal - not visible to client</span>
              </Row>
              <textarea
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Add internal note for the team..."
                rows={5}
                style={{
                  width: '100%',
                  minHeight: 96,
                  background: '#0A0A0A',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontFamily: 'Chakra Petch, sans-serif',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: T.text,
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              <Row gap={8} style={{ marginTop: 12 }}>
                <PrimaryBtn onClick={onSaveNote} disabled={isSavingNote}>
                  {isSavingNote ? 'Saving...' : 'Save Note'}
                </PrimaryBtn>
                <GhostBtn onClick={() => setNoteDraft('')} style={{ padding: '6px 12px', borderColor: 'rgba(255,255,255,0.10)', color: T.text3 }}>
                  Clear
                </GhostBtn>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 9, color: T.text3 }}>{selected.admin_note ? 'Saved note' : 'No note saved'}</span>
              </Row>
            </div>
          </>
        )}
        {error && <div style={{ margin: '0 22px 18px', color: T.ember2, fontSize: 10 }}>{error}</div>}
      </div>
    </section>
  )
}

function FeedbackListItem({ item, active, clipLabel, version, onSelect }) {
  const pending = item.status === 'pending'
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: active ? 'rgba(255,107,43,0.09)' : 'rgba(0,0,0,0.18)',
        border: 0,
        borderLeft: active ? `3px solid ${T.ember2}` : '3px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '13px 18px 14px',
        cursor: 'pointer',
        fontFamily: 'Chakra Petch, sans-serif',
        color: pending ? T.text : T.text3,
      }}
    >
      <Row gap={8} align="flex-start">
        <Avatar name={item.reviewer_name} size={18} />
        <Col gap={5} style={{ flex: 1, minWidth: 0 }}>
          <Row gap={7}>
            <span style={{ fontSize: 11, fontWeight: 700, color: pending ? T.text : T.text2 }}>{item.reviewer_name || 'Reviewer'}</span>
            <StatusTag status={item.status} />
            <VersionBadge version={version} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo(item.created_at)}</span>
          </Row>
          <span style={{ fontSize: 11, lineHeight: 1.5, color: pending ? T.text : T.text3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.comment}
          </span>
          <Row gap={6}>
            <span style={{ fontSize: 9, color: T.text3, fontFamily: 'monospace' }}>{item.camera_snapshot_json?.name || clipLabel}</span>
            <span style={{ fontSize: 9, color: T.text4 }}>-</span>
            <span style={{ fontSize: 9, color: T.text3, fontFamily: 'monospace' }}>{item.clip_time_seconds != null ? formatTimecode(item.clip_time_seconds) : '00:00'}</span>
          </Row>
        </Col>
      </Row>
    </button>
  )
}

function StageSnapshot({ annotation, cameraName, timecode }) {
  const bounds = annotation?.bounds
  const snapshot = annotation?.snapshot
  const snapshotSrc = snapshot?.url || snapshot?.publicUrl || snapshot?.dataUrl
  const viewportWidth = Number(snapshot?.width) || Number(annotation?.viewport?.width) || 16
  const viewportHeight = Number(snapshot?.height) || Number(annotation?.viewport?.height) || 9
  const isCircle = annotation?.type === 'circle'
  const { x = 0, y = 0, width = 0, height = 0 } = bounds ?? {}

  return (
    <div style={{ width: '100%', aspectRatio: `${viewportWidth} / ${viewportHeight}`, minHeight: 260, maxHeight: '58vh', background: '#000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
      {snapshotSrc ? (
        <img src={snapshotSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <FallbackStageArt />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.38) 100%)' }} />
      {bounds && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(1, x)) * 100}%`,
            top: `${Math.max(0, Math.min(1, y)) * 100}%`,
            width: `${Math.max(0, Math.min(1, width)) * 100}%`,
            height: `${Math.max(0, Math.min(1, height)) * 100}%`,
            border: '2.5px dashed #FF6B2B',
            borderRadius: isCircle ? 999 : 8,
            boxShadow: '0 0 16px rgba(255,107,43,0.35), inset 0 0 8px rgba(255,107,43,0.08)',
          }}
        />
      )}
      <div style={{ position: 'absolute', top: 10, left: 12, display: 'flex', gap: 6 }}>
        {cameraName && <SnapshotBadge color={T.cam}>{`* ${cameraName}`}</SnapshotBadge>}
        {timecode && <SnapshotBadge>{timecode}</SnapshotBadge>}
      </div>
      <div style={{ position: 'absolute', bottom: 10, right: 12, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 8px', fontSize: 9, color: T.text3, fontFamily: 'monospace' }}>
        {viewportWidth} x {viewportHeight}
      </div>
      {!snapshotSrc && (
        <div style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 10, color: T.text4 }}>
          Legacy feedback has no captured snapshot
        </div>
      )}
    </div>
  )
}

function hasVisualAnnotation(item) {
  return Boolean(item?.annotation_json?.bounds || item?.annotation_json?.snapshot)
}

function FallbackStageArt() {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#050505 0%,#1a0e08 60%,#050505 100%)' }} />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 600 338" preserveAspectRatio="xMidYMid slice">
        <rect x="0" y="240" width="600" height="98" fill="#1a1a1a" />
        <polygon points="100,240 500,240 560,338 40,338" fill="#0d0d0d" />
        <polygon points="240,170 360,170 380,240 220,240" fill="#5a1a0a" opacity="0.9" />
        <polygon points="260,180 340,180 358,238 242,238" fill="#a02818" />
        <polygon points="280,150 300,210 290,215" fill="#FF6B2B" opacity="0.8" />
        <polygon points="320,150 300,210 310,215" fill="#FF6B2B" opacity="0.8" />
        <polygon points="270,165 250,220 240,220" fill="#D4820A" opacity="0.7" />
        <polygon points="330,165 350,220 360,220" fill="#D4820A" opacity="0.7" />
        <rect x="80" y="210" width="40" height="30" fill="#3a1810" />
        <rect x="480" y="210" width="40" height="30" fill="#3a1810" />
        <ellipse cx="300" cy="220" rx="180" ry="40" fill="#FF6B2B" opacity="0.08" />
      </svg>
    </>
  )
}

function SnapshotBadge({ color = T.text2, children }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${color === T.cam ? 'rgba(31,160,238,0.5)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 4, padding: '3px 8px', fontSize: 9, color, fontWeight: 700, letterSpacing: '0.05em', backdropFilter: 'blur(4px)', fontFamily: 'monospace' }}>
      {children}
    </div>
  )
}

function LogoMark() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: 5, background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', boxShadow: '0 0 14px rgba(232,83,26,0.35)' }}>
      SV
    </div>
  )
}

function VersionTag({ label }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: T.green, border: `1px solid ${T.green}`, background: 'rgba(43,199,130,0.08)', borderRadius: 4, padding: '2px 9px' }}>
      {label}
    </span>
  )
}

function StatRow({ color, label, value }) {
  return (
    <Row gap={8}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: color === T.ember2 ? '0 0 10px rgba(255,107,43,0.5)' : 'none' }} />
      <span style={{ fontSize: 11, color: T.text2 }}>{label}</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
    </Row>
  )
}

function Avatar({ name, size = 20 }) {
  const initial = (name || 'R').trim().slice(0, 1).toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#B04018,#4A2010)', border: '1px solid rgba(232,83,26,0.45)', color: T.ember2, fontSize: Math.max(9, size * 0.34), fontWeight: 800 }}>
      {initial}
    </div>
  )
}

const sectionLabelStyle = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.text3,
}

const filterLabelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: T.text3,
}

const selectStyle = {
  width: '100%',
  background: '#151515',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  padding: '9px 10px',
  color: T.text,
  fontSize: 11,
  fontFamily: 'Chakra Petch, sans-serif',
  fontWeight: 700,
}

const navBtnStyle = {
  width: 22,
  height: 22,
  border: 0,
  background: 'transparent',
  color: T.text3,
  fontFamily: 'Chakra Petch, sans-serif',
  fontSize: 16,
  cursor: 'pointer',
}

const detailMetaStyle = {
  fontSize: 10,
  color: T.text3,
  fontFamily: 'monospace',
}

const versionBadgeStyle = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: '2px 7px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Chakra Petch, sans-serif',
  whiteSpace: 'nowrap',
}

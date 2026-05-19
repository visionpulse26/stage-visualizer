import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, MessageSquare, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react'

const T = {
  bg: '#080604',
  glass: 'rgba(255,255,255,0.045)',
  glass2: 'rgba(255,255,255,0.07)',
  border: 'rgba(220,100,30,0.20)',
  border2: 'rgba(220,100,30,0.32)',
  ember: '#E8531A',
  ember2: '#FF6B2B',
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

const Spacer = () => <div style={{ flex: 1 }} />

function GhostBtn({ children, onClick, danger = false, disabled = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '5px 9px',
        borderRadius: 6,
        border: `1px solid ${danger ? 'rgba(232,83,26,0.35)' : T.border}`,
        background: disabled ? 'rgba(255,255,255,0.025)' : T.glass,
        color: danger ? T.ember2 : T.text2,
        fontFamily: 'Chakra Petch, sans-serif',
        fontSize: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function PrimaryBtn({ children, onClick, disabled = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 6,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : 'rgba(232,83,26,0.55)'}`,
        background: disabled ? 'rgba(255,255,255,0.035)' : 'rgba(232,83,26,0.16)',
        color: disabled ? T.text4 : T.text,
        fontFamily: 'Chakra Petch, sans-serif',
        fontSize: 10,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: disabled ? 'none' : '0 0 14px rgba(232,83,26,0.12)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function StatusPill({ status }) {
  const color = status === 'published' ? T.green : status === 'draft' ? T.amber : T.text3
  return (
    <span style={{
      color,
      border: `1px solid ${status === 'archived' ? 'rgba(255,255,255,0.12)' : color}`,
      background: status === 'archived' ? 'rgba(255,255,255,0.04)' : `${color}18`,
      borderRadius: 4,
      padding: '2px 6px',
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>
      {status}
    </span>
  )
}

function TextInput({ value, onChange, multiline = false, placeholder = '', style = {} }) {
  const common = {
    width: '100%',
    border: `1px solid ${T.border}`,
    background: 'rgba(0,0,0,0.35)',
    color: T.text,
    borderRadius: 6,
    padding: '6px 8px',
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 11,
    outline: 'none',
    resize: 'vertical',
    ...style,
  }
  if (multiline) {
    return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={common} />
  }
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={common} />
}

function formatDate(value) {
  if (!value) return 'not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'not set'
  return date.toLocaleString()
}

function FeedbackBadge({ count }) {
  const active = count > 0
  return (
    <span
      title={`${count} feedback item${count === 1 ? '' : 's'}`}
      style={{
        position: 'relative',
        width: 28,
        height: 22,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? '#FFB15E' : T.text4,
        background: active ? 'rgba(232,83,26,0.16)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${active ? 'rgba(232,83,26,0.38)' : 'rgba(255,255,255,0.07)'}`,
        flexShrink: 0,
      }}
    >
      <MessageSquare size={13} strokeWidth={2.1} />
      <span style={{
        position: 'absolute',
        top: -5,
        right: -5,
        minWidth: 14,
        height: 14,
        padding: '0 4px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'linear-gradient(180deg, #FF7A2F, #E8531A)' : 'rgba(255,255,255,0.08)',
        color: active ? '#160704' : T.text4,
        fontSize: 8,
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: active ? '0 0 10px rgba(232,83,26,0.32)' : 'none',
      }}>
        {count}
      </span>
    </span>
  )
}

function MoreMenu({ version, onRestore, onRenameStart, onDelete }) {
  const [open, setOpen] = useState(false)
  const itemStyle = (danger = false) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 9px',
    border: 0,
    background: 'transparent',
    color: danger ? T.ember2 : T.text2,
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 10,
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  const run = (fn) => {
    setOpen(false)
    fn()
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={`More actions for version ${version.version_number}`}
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          border: '1px solid transparent',
          background: open ? 'rgba(255,255,255,0.075)' : 'transparent',
          color: T.text3,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 30,
          zIndex: 5,
          minWidth: 154,
          padding: 5,
          borderRadius: 8,
          background: 'rgba(16,12,9,0.98)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 14px 34px rgba(0,0,0,0.48)',
        }}>
          {version.status !== 'draft' && (
            <button style={itemStyle()} onClick={() => run(() => onRestore(version))}>
              <RotateCcw size={13} /> Restore as draft
            </button>
          )}
          <button style={itemStyle()} onClick={() => run(onRenameStart)}>
            <Pencil size={13} /> Rename
          </button>
          {version.status === 'archived' && (
            <button style={itemStyle(true)} onClick={() => run(() => onDelete(version))}>
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function VersionRow({ version, feedbackCount, compact = false, onPreview, onRestore, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [versionName, setVersionName] = useState(version.version_name || '')
  const [releaseNotes, setReleaseNotes] = useState(version.release_notes || '')
  const stamp = version.status === 'published' ? version.published_at : version.created_at

  useEffect(() => {
    setVersionName(version.version_name || '')
    setReleaseNotes(version.release_notes || '')
  }, [version.id, version.release_notes, version.version_name])

  return (
    <div style={{
      position: 'relative',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: version.status === 'published' ? 'rgba(43,199,130,0.035)' : 'transparent',
      padding: compact ? '6px 2px' : '10px 2px',
    }}>
      {editing ? (
        <Col gap={7} style={{ padding: compact ? '2px 0 6px' : '0 0 4px' }}>
          <Row gap={7}>
            <span style={{ color: T.text, fontSize: 12, fontWeight: 800, minWidth: 30 }}>v{version.version_number}</span>
            <TextInput value={versionName} onChange={setVersionName} placeholder="Version name" />
          </Row>
          <Col gap={7} style={{ paddingLeft: 37 }}>
            <TextInput value={releaseNotes} onChange={setReleaseNotes} multiline placeholder="Release notes" />
            <Row>
              <GhostBtn onClick={() => {
                onRename(version.id, { versionName, releaseNotes })
                setEditing(false)
              }}>
                Save
              </GhostBtn>
              <GhostBtn onClick={() => setEditing(false)}>Cancel</GhostBtn>
            </Row>
          </Col>
        </Col>
      ) : (
        <Row gap={10} align="center">
          <Col gap={compact ? 2 : 4} style={{ minWidth: 0, flex: 1 }}>
            <Row gap={7} style={{ minWidth: 0 }}>
              {!compact && <StatusPill status={version.status} />}
              <span style={{ color: T.text, fontSize: compact ? 11 : 12, fontWeight: 800, flexShrink: 0 }}>v{version.version_number}</span>
              <span style={{
                color: compact ? T.text3 : T.text2,
                fontSize: compact ? 10 : 11,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: compact ? 500 : 650,
              }}>
                {version.version_name || 'Untitled version'}
              </span>
            </Row>
            <span style={{
              color: T.text4,
              fontSize: compact ? 8 : 9,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {version.status === 'published' ? 'Published' : 'Created'} {formatDate(stamp)}
              {version.status === 'published' && version.published_by ? ` by ${version.published_by}` : ''}
              {version.status !== 'published' && version.created_by ? ` by ${version.created_by}` : ''}
              {version.restored_from ? ' - restored' : ''}
            </span>
          </Col>
          <FeedbackBadge count={feedbackCount} />
          <PrimaryBtn onClick={() => onPreview(version.id)} style={{ padding: compact ? '4px 8px' : '5px 10px' }}>
            <Eye size={13} /> Preview
          </PrimaryBtn>
          <MoreMenu
            version={version}
            onRestore={onRestore}
            onRenameStart={() => setEditing(true)}
            onDelete={onDelete}
          />
        </Row>
      )}
    </div>
  )
}

export default function VersionHistoryDrawer({
  projectId,
  projectName,
  loadAllVersions,
  loadFeedback,
  discardDraft,
  restoreVersion,
  revertDraftToPublished,
  renameVersion,
  deleteVersion,
  pruneArchivedVersions,
  onClose,
  onChanged,
  hasUnsavedChanges = false,
}) {
  const [versions, setVersions] = useState([])
  const [feedbackCounts, setFeedbackCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [keepLatest, setKeepLatest] = useState(10)
  const [olderThanDays, setOlderThanDays] = useState(90)

  const grouped = useMemo(() => ({
    draft: versions.filter(v => v.status === 'draft'),
    published: versions.filter(v => v.status === 'published'),
    archived: versions.filter(v => v.status === 'archived'),
  }), [versions])

  const refresh = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const [nextVersions, feedback] = await Promise.all([
        loadAllVersions(projectId),
        loadFeedback(projectId),
      ])
      const counts = {}
      for (const item of feedback ?? []) {
        const id = item.presentation_version_id
        if (!id) continue
        counts[id] = (counts[id] || 0) + 1
      }
      setVersions(nextVersions)
      setFeedbackCounts(counts)
    } catch (err) {
      setError(err.message || 'Failed to load version history.')
    } finally {
      setLoading(false)
    }
  }, [loadAllVersions, loadFeedback, projectId])

  useEffect(() => { refresh() }, [refresh])

  const runAction = async (action, { reload = false } = {}) => {
    if (reload && hasUnsavedChanges) {
      const ok = window.confirm(
        'You have unsaved editor changes. This version action will reload the editor and discard those local edits. Continue?'
      )
      if (!ok) return
    }
    setBusy(true)
    setError('')
    try {
      await action()
      if (reload) {
        onChanged?.()
        return
      }
      await refresh()
    } catch (err) {
      setError(err.message || 'Version action failed.')
    } finally {
      setBusy(false)
    }
  }

  const previewVersion = (versionId) => {
    window.open(`/view/${projectId}?versionId=${versionId}`, '_blank', 'noopener,noreferrer')
  }

  const restoreAsDraft = (version) => {
    const hasDraft = grouped.draft.length > 0
    const message = hasDraft
      ? `Restore v${version.version_number} as a new draft? The current draft will be archived first.`
      : `Restore v${version.version_number} as a new draft?`
    if (!window.confirm(message)) return
    runAction(() => restoreVersion(projectId, version.id), { reload: true })
  }

  const discardCurrentDraft = () => {
    if (!grouped.draft.length) return
    if (!window.confirm('Discard the current draft? Published and archived versions will stay unchanged.')) return
    runAction(() => discardDraft(projectId), { reload: true })
  }

  const revertToPublished = () => {
    if (!window.confirm('Archive the current draft and restore the published version as a new draft?')) return
    runAction(() => revertDraftToPublished(projectId), { reload: true })
  }

  const deleteArchived = (version) => {
    if (!window.confirm(`Delete archived v${version.version_number}? Feedback links to this version will be detached by the database.`)) return
    runAction(() => deleteVersion(version.id))
  }

  const cleanupArchived = () => {
    if (keepLatest < 1 || olderThanDays <= 0) {
      setError('Cleanup must keep at least 1 archived version and use an age greater than 0 days.')
      return
    }
    if (!window.confirm(`Delete archived versions older than ${olderThanDays} days while keeping the newest ${keepLatest}?`)) return
    runAction(() => pruneArchivedVersions(projectId, { keepLatest, olderThanDays }))
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 120,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      justifyContent: 'flex-end',
    }}>
      <aside style={{
        width: 430,
        maxWidth: '100vw',
        height: '100%',
        background: `linear-gradient(180deg, rgba(18,13,9,0.98), ${T.bg})`,
        borderLeft: `1px solid ${T.border2}`,
        boxShadow: '-18px 0 50px rgba(0,0,0,0.5)',
        color: T.text,
        fontFamily: 'Chakra Petch, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Row style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.075)' }}>
          <Col gap={2} style={{ minWidth: 0 }}>
            <span style={{ color: T.text, fontSize: 15, fontWeight: 800 }}>Version History</span>
            <span style={{ color: T.text3, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</span>
          </Col>
          <Spacer />
          <button
            onClick={onClose}
            aria-label="Close version history"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.045)',
              color: T.text2,
              fontFamily: 'Chakra Petch, sans-serif',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            x
          </button>
        </Row>

        <details style={{
          margin: '10px 16px 0',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
          paddingBottom: 10,
        }}>
          <summary style={{
            cursor: 'pointer',
            color: T.text3,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            listStyle: 'none',
          }}>
            Management
          </summary>
          <Col gap={9} style={{ paddingTop: 10 }}>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <GhostBtn onClick={discardCurrentDraft} disabled={busy || !grouped.draft.length}>Discard draft</GhostBtn>
              <GhostBtn onClick={revertToPublished} disabled={busy || !grouped.published.length}>Revert draft to published</GhostBtn>
            </Row>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <span style={{ color: T.text3, fontSize: 9, minWidth: 90 }}>Cleanup archived</span>
              <TextInput
                value={String(keepLatest)}
                onChange={v => setKeepLatest(Number(v) || 0)}
                placeholder="Keep"
                style={{ width: 68, textAlign: 'center' }}
              />
              <TextInput
                value={String(olderThanDays)}
                onChange={v => setOlderThanDays(Number(v) || 0)}
                placeholder="Days"
                style={{ width: 76, textAlign: 'center' }}
              />
              <GhostBtn onClick={cleanupArchived} disabled={busy || !grouped.archived.length}>Run</GhostBtn>
            </Row>
          </Col>
        </details>

        {error && (
          <div style={{ margin: '10px 16px 0', color: T.ember2, fontSize: 10, border: '1px solid rgba(232,83,26,0.3)', padding: 8, borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 18px' }}>
          {loading ? (
            <span style={{ color: T.text3, fontSize: 11 }}>Loading history...</span>
          ) : (
            <Col gap={18}>
              {[
                ['Draft', grouped.draft, false],
                ['Published', grouped.published, false],
                [`Archived (${grouped.archived.length})`, grouped.archived, true],
              ].map(([label, items, compact]) => (
                <Col key={label} gap={compact ? 4 : 7}>
                  <Row gap={9}>
                    <span style={{
                      color: compact ? T.text4 : T.text3,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}>
                      {label}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                  </Row>
                  {items.length ? items.map(version => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      compact={compact}
                      feedbackCount={feedbackCounts[version.id] || 0}
                      onPreview={previewVersion}
                      onRestore={restoreAsDraft}
                      onRename={(id, patch) => runAction(() => renameVersion(id, patch))}
                      onDelete={deleteArchived}
                    />
                  )) : (
                    <span style={{ color: T.text4, fontSize: 10 }}>No {String(label).toLowerCase()} versions.</span>
                  )}
                </Col>
              ))}
            </Col>
          )}
        </div>
      </aside>
    </div>
  )
}

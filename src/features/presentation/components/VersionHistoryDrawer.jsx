import { useCallback, useEffect, useMemo, useState } from 'react'

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

function TextInput({ value, onChange, multiline = false, placeholder = '' }) {
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

function VersionCard({ version, feedbackCount, onPreview, onRestore, onRename, onDelete }) {
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
      border: `1px solid ${T.border}`,
      background: 'rgba(0,0,0,0.24)',
      borderRadius: 8,
      padding: '9px 10px',
    }}>
      <Col gap={8}>
        <Row>
          <StatusPill status={version.status} />
          <span style={{ color: T.text, fontSize: 12, fontWeight: 700 }}>v{version.version_number}</span>
          <span style={{ color: T.text2, fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {version.version_name || 'Untitled version'}
          </span>
          <Spacer />
          <span style={{ color: T.text4, fontSize: 9 }}>{feedbackCount} feedback</span>
        </Row>

        <span style={{ color: T.text3, fontSize: 9 }}>
          {version.status === 'published' ? 'published' : 'created'} {formatDate(stamp)}
          {version.status === 'published' && version.published_by ? ` by ${version.published_by}` : ''}
          {version.status !== 'published' && version.created_by ? ` by ${version.created_by}` : ''}
        </span>

        {version.restored_from && (
          <span style={{ color: T.amber, fontSize: 9 }}>Restored from another version</span>
        )}

        {editing ? (
          <Col gap={7}>
            <TextInput value={versionName} onChange={setVersionName} placeholder="Version name" />
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
        ) : (
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <GhostBtn onClick={() => onPreview(version.id)}>Preview</GhostBtn>
            {version.status !== 'draft' && <GhostBtn onClick={() => onRestore(version)}>Restore as draft</GhostBtn>}
            <GhostBtn onClick={() => setEditing(true)}>Rename</GhostBtn>
            {version.status === 'archived' && <GhostBtn danger onClick={() => onDelete(version)}>Delete</GhostBtn>}
          </Row>
        )}
      </Col>
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
        <Row style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <Col gap={2} style={{ minWidth: 0 }}>
            <span style={{ color: T.text, fontSize: 15, fontWeight: 800 }}>Version History</span>
            <span style={{ color: T.text3, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</span>
          </Col>
          <Spacer />
          <GhostBtn onClick={onClose}>Close</GhostBtn>
        </Row>

        <Col gap={8} style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <GhostBtn onClick={discardCurrentDraft} disabled={busy || !grouped.draft.length}>Discard draft</GhostBtn>
            <GhostBtn onClick={revertToPublished} disabled={busy || !grouped.published.length}>Revert draft to published</GhostBtn>
          </Row>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <span style={{ color: T.text3, fontSize: 9 }}>Cleanup archived</span>
            <TextInput value={String(keepLatest)} onChange={v => setKeepLatest(Number(v) || 0)} placeholder="Keep" />
            <TextInput value={String(olderThanDays)} onChange={v => setOlderThanDays(Number(v) || 0)} placeholder="Days" />
            <GhostBtn onClick={cleanupArchived} disabled={busy || !grouped.archived.length}>Run</GhostBtn>
          </Row>
        </Col>

        {error && (
          <div style={{ margin: '10px 16px 0', color: T.ember2, fontSize: 10, border: '1px solid rgba(232,83,26,0.3)', padding: 8, borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <span style={{ color: T.text3, fontSize: 11 }}>Loading history...</span>
          ) : (
            <Col gap={16}>
              {[
                ['Draft', grouped.draft],
                ['Published', grouped.published],
                [`Archived (${grouped.archived.length})`, grouped.archived],
              ].map(([label, items]) => (
                <Col key={label} gap={8}>
                  <Row>
                    <span style={{ color: T.text3, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  </Row>
                  {items.length ? items.map(version => (
                    <VersionCard
                      key={version.id}
                      version={version}
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

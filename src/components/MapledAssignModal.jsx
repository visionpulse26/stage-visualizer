import { useState } from 'react'

// Shared "Assign LED maps" modal for multi-mapled uploads.
//
// One visual (a song / loop) is uploaded as N files — one per LED map. The
// auto-grouper proposes a file→target assignment from filename suffixes
// (_M / _S / etc.); this modal lets the user confirm or correct it before the
// clip is built. Used by both the presentation editor and the collab sandbox,
// so the colour palette is themeable (pass `theme`); it defaults to a neutral
// dark palette that fits the collab UI.

const DEFAULT_THEME = {
  bg:     '#0c0a08',
  border: 'rgba(255,255,255,0.14)',
  border2:'rgba(255,255,255,0.22)',
  glass2: 'rgba(255,255,255,0.07)',
  text:   '#F4ECE2',
  text2:  '#C8B8A8',
  text3:  '#8E7E70',
  text4:  '#5A4E45',
  accent: '#E8531A',
  amber:  '#E0A030',
}

export default function MapledAssignModal({ groups: initialGroups, targets, onCancel, onConfirm, theme }) {
  const T = { ...DEFAULT_THEME, ...(theme || {}) }
  const [groups, setGroups] = useState(initialGroups)

  const setTarget = (gi, ai, targetId) => {
    setGroups(prev => prev.map((g, i) => i !== gi ? g : {
      ...g,
      assignments: g.assignments.map((a, j) => j !== ai ? a : {
        ...a,
        targetId: targetId || null,
        targetLabel: targets.find(t => t.targetId === targetId)?.label || '',
        auto: false,
      }),
    }))
  }

  const groupState = (g) => {
    const counts = new Map()
    g.assignments.forEach(a => { if (a.targetId) counts.set(a.targetId, (counts.get(a.targetId) || 0) + 1) })
    return {
      missing: targets.filter(t => !counts.has(t.targetId)).map(t => t.label),
      conflict: [...counts].filter(([, n]) => n > 1).length > 0,
      anyAssigned: g.assignments.some(a => a.targetId),
    }
  }

  const canUpload = groups.some(g => g.assignments.some(a => a.targetId)) &&
    !groups.some(g => groupState(g).conflict)

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
  const card = { width: 'min(620px, 94vw)', maxHeight: '86vh', overflow: 'auto', background: T.bg, border: `1px solid ${T.border2}`, borderRadius: 12, padding: 20, fontFamily: 'Chakra Petch, sans-serif', color: T.text }
  const sel = { background: T.glass2, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 6px', fontSize: 11, fontFamily: 'inherit' }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Assign LED maps</div>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
          Each visual drives {targets.length} LED maps. Confirm which file goes to which map — they’ll play in sync as one clip.
        </div>

        {groups.map((g, gi) => {
          const st = groupState(g)
          return (
            <div key={g.key} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 650, marginBottom: 8 }}>{g.clipName || 'Untitled clip'}</div>
              {g.assignments.map((a, ai) => (
                <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 11, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file?.name}</span>
                  {a.auto && a.targetId && <span style={{ fontSize: 9, color: T.text4 }}>auto</span>}
                  <select value={a.targetId || ''} onChange={(e) => setTarget(gi, ai, e.target.value)} style={sel}>
                    <option value="">— none —</option>
                    {targets.map(t => <option key={t.targetId} value={t.targetId}>{t.label}</option>)}
                  </select>
                </div>
              ))}
              {st.conflict && (
                <div style={{ fontSize: 10, color: '#E8531A', marginTop: 4 }}>⚠ Two files target the same map — fix before uploading.</div>
              )}
              {!st.conflict && st.missing.length > 0 && (
                <div style={{ fontSize: 10, color: T.amber, marginTop: 4 }}>No file for: {st.missing.join(', ')} (that map stays dark)</div>
              )}
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.text3, borderRadius: 6, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => onConfirm(groups)} disabled={!canUpload} style={{ background: canUpload ? T.accent : T.glass2, border: 'none', color: canUpload ? '#fff' : T.text4, borderRadius: 6, padding: '6px 16px', fontSize: 11, fontWeight: 650, cursor: canUpload ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Upload</button>
        </div>
      </div>
    </div>
  )
}

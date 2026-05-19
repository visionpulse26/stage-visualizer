import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconX       = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IconCopy    = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
const IconEdit    = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconTrash   = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconClone   = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
const IconLock    = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
const IconUnlock  = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>
const IconChevron = ({ down }) => <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${down ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
const IconRefresh = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fmtExt(name) {
  return name?.split('.').pop()?.toUpperCase() || '?'
}

// ── Spinner, ErrorBanner & Toast ──────────────────────────────────────────────
function Spinner() {
  return (
    <div className="relative w-8 h-8 mx-auto">
      <div className="absolute inset-0 rounded-full border-2 border-white/10" />
      <div className="absolute inset-0 rounded-full border-2 border-t-orange-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
    </div>
  )
}

function ErrorBanner({ msg }) {
  return (
    <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
      ✗ {msg}
    </div>
  )
}

function Toast({ msg, type = 'error', onDismiss }) {
  if (!msg) return null
  const colors = type === 'error'
    ? 'bg-red-500/15 border-red-500/30 text-red-300'
    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs mb-3 ${colors}`}>
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
    </div>
  )
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ onOpenProject, onClose }) {
  const [projects,       setProjects]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [toast,          setToast]          = useState(null)
  const [editingId,      setEditingId]      = useState(null)
  const [editingName,    setEditingName]    = useState('')
  const [confirmId,      setConfirmId]      = useState(null)
  const [deletingId,     setDeletingId]     = useState(null)
  const [cloningId,      setCloningId]      = useState(null)
  const [copied,         setCopied]         = useState(null)
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin

  const groupedProjects = useMemo(() => {
    const byKey = {}
    for (const p of projects) {
      const key = p.group_id ?? p.id
      if (!byKey[key]) byKey[key] = []
      byKey[key].push(p)
    }
    for (const k of Object.keys(byKey)) {
      byKey[k].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    return Object.entries(byKey)
      .map(([key, members]) => ({ key, members }))
      .sort((a, b) => {
        const aMax = Math.max(...a.members.map(m => new Date(m.created_at)))
        const bMax = Math.max(...b.members.map(m => new Date(m.created_at)))
        return bMax - aMax
      })
  }, [projects])

  const toggleGroup = useCallback((key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, created_at, video_url, stage_url, camera_presets, grid_cell_size, scene_config, media_playlist, group_id, is_client_locked')
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setProjects(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCopy = useCallback((text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  const handleRenameCommit = useCallback(async (id) => {
    const trimmed = editingName.trim()
    if (!trimmed) { setEditingId(null); return }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: trimmed } : p))
    setEditingId(null)
    const { error: err } = await supabase.from('projects').update({ name: trimmed }).eq('id', id)
    if (err) {
      setToast({ msg: `Rename failed: ${err.message}`, type: 'error' })
      await load()
    }
  }, [editingName, load])

  const handleClone = useCallback(async (project) => {
    const name = window.prompt('Enter name for the new round:', `${project.name || 'Untitled'} - Round 2`)
    if (!name || !name.trim()) return
    setCloningId(project.id); setToast(null)
    try {
      const { data: newId, error: rpcErr } = await supabase.rpc('clone_project', {
        p_source_id: project.id,
        p_new_name: name.trim(),
      })
      if (rpcErr) { setToast({ msg: `Clone failed: ${rpcErr.message}`, type: 'error' }); return }
      if (!newId) { setToast({ msg: 'Clone failed: source project not found.', type: 'error' }); return }
      const { data: newProject, error: fetchErr } = await supabase
        .from('projects').select('*').eq('id', newId).single()
      if (fetchErr || !newProject) {
        setToast({ msg: 'Cloned but failed to load. Refresh the list.', type: 'error' })
        await load(); return
      }
      setToast({ msg: 'Project cloned successfully.', type: 'success' })
      onOpenProject(newProject)
      onClose?.()
    } catch (err) {
      setToast({ msg: `Unexpected error: ${err.message}`, type: 'error' })
    } finally {
      setCloningId(null)
    }
  }, [load, onOpenProject, onClose])

  const handleDelete = useCallback(async (project) => {
    setDeletingId(project.id); setConfirmId(null); setToast(null)
    try {
      const { data: canDelete, error: checkErr } = await supabase.rpc('can_safely_delete_storage', {
        p_project_id: project.id,
      })
      if (checkErr) { setToast({ msg: `Delete check failed: ${checkErr.message}`, type: 'error' }); return }
      if (canDelete) {
        const { data: files, error: listErr } = await supabase.storage.from('projects').list(project.id)
        if (!listErr && files && files.length > 0) {
          await supabase.storage.from('projects').remove(files.map(f => `${project.id}/${f.name}`))
        }
      }
      const { error: dbErr } = await supabase.from('projects').delete().eq('id', project.id)
      if (dbErr) { setToast({ msg: `Delete failed: ${dbErr.message}`, type: 'error' }); return }
      await load()
      setToast({ msg: `"${project.name || 'Untitled'}" deleted.`, type: 'success' })
    } catch (err) {
      setToast({ msg: `Unexpected error: ${err.message}`, type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }, [load])

  const handleToggleLock = useCallback(async (project) => {
    const next = !project.is_client_locked
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, is_client_locked: next } : p))
    const { error: err } = await supabase.from('projects').update({ is_client_locked: next }).eq('id', project.id)
    if (err) {
      setToast({ msg: `Lock update failed: ${err.message}`, type: 'error' })
      await load()
    } else {
      setToast({ msg: next ? 'Client link locked' : 'Client link unlocked', type: 'success' })
    }
  }, [load])

  // ── Flat project row (replaces heavy card) ────────────────────────────────
  const renderProjectRow = useCallback((p) => (
    <div
      key={p.id}
      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-orange-500/[0.07] transition-colors"
    >
      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        {editingId === p.id ? (
          <input
            autoFocus
            value={editingName}
            onChange={e => setEditingName(e.target.value)}
            onBlur={() => handleRenameCommit(p.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameCommit(p.id)
              if (e.key === 'Escape') setEditingId(null)
            }}
            onClick={e => e.stopPropagation()}
            className="w-full bg-white/[0.08] border border-orange-500/30 rounded px-2 py-0.5 text-sm text-white/95 focus:outline-none focus:border-orange-500/60"
          />
        ) : (
          <span className="block text-sm font-semibold text-white/95 truncate">
            {p.name || <span className="text-amber-400/70 italic">Untitled</span>}
          </span>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-white/52">Created {fmtDate(p.created_at)}</span>
          <span
            className="text-[9px] text-white/20 font-mono group-hover:text-white/38 transition-colors"
            title={p.id}
          >
            {p.id.slice(0, 8)}…
          </span>
          <button
            onClick={e => { e.stopPropagation(); handleCopy(p.id, `id-${p.id}`) }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white/70"
            title="Copy project ID"
          >
            {copied === `id-${p.id}`
              ? <span className="text-emerald-400 text-[9px] font-medium">✓</span>
              : <IconCopy />}
          </button>
        </div>
      </div>

      {/* Copy link chips */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {[
          { key: `collab-${p.id}`, label: 'Collab', path: `/collab/${p.id}` },
          { key: `view-${p.id}`,   label: 'View',   path: `/view/${p.id}` },
        ].map(({ key, label, path }) => (
          <button
            key={key}
            onClick={e => { e.stopPropagation(); handleCopy(`${baseUrl}${path}`, key) }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.07] hover:bg-orange-500/[0.15] border border-white/[0.12] text-white/55 hover:text-orange-300 text-[9px] transition-all"
          >
            {copied === key ? <span className="text-emerald-400">✓</span> : null}
            {label}
          </button>
        ))}
      </div>

      {/* Lock toggle — I/O pill, always visible */}
      <button
        onClick={e => { e.stopPropagation(); handleToggleLock(p) }}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium transition-all flex-shrink-0 border ${
          p.is_client_locked
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
            : 'bg-white/[0.05] border-white/[0.12] text-white/38 hover:text-white/62 hover:border-white/22'
        }`}
        title={p.is_client_locked ? 'Click to unlock' : 'Click to lock client link'}
      >
        {p.is_client_locked ? <><IconLock /> Locked</> : <IconUnlock />}
      </button>

      {/* Open Stage CTA — always visible, primary orange */}
      <button
        onClick={e => { e.stopPropagation(); onOpenProject(p) }}
        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/35 text-orange-300 text-xs font-semibold transition-all flex-shrink-0"
      >
        Open
      </button>

      {/* Ghost management — hover only, always visible during confirm */}
      <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${confirmId === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button
          onClick={e => { e.stopPropagation(); handleClone(p) }}
          disabled={cloningId === p.id}
          className="p-1.5 rounded hover:bg-white/8 text-white/45 hover:text-white/75 transition-all disabled:opacity-40"
          title="Clone as new round"
        >
          {cloningId === p.id ? <span className="text-[10px]">…</span> : <IconClone />}
        </button>
        <button
          onClick={e => { e.stopPropagation(); setEditingId(p.id); setEditingName(p.name || '') }}
          className="p-1.5 rounded hover:bg-white/8 text-white/45 hover:text-white/75 transition-all"
          title="Rename"
        >
          <IconEdit />
        </button>
        {confirmId === p.id ? (
          <>
            <button
              onClick={e => { e.stopPropagation(); handleDelete(p) }}
              disabled={deletingId === p.id}
              className="px-2 py-1 rounded bg-red-500/25 hover:bg-red-500/35 border border-red-500/28 text-red-300 text-[10px] font-medium transition-all disabled:opacity-50 ml-0.5"
            >
              {deletingId === p.id ? '…' : 'Delete'}
            </button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmId(null) }}
              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/35 text-[10px] transition-all"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirmId(p.id) }}
            disabled={deletingId === p.id}
            className="p-1.5 rounded hover:bg-red-500/15 text-white/42 hover:text-red-400 transition-all disabled:opacity-40"
            title="Delete"
          >
            {deletingId === p.id ? <span className="text-[10px]">…</span> : <IconTrash />}
          </button>
        )}
      </div>
    </div>
  ), [editingId, editingName, confirmId, deletingId, cloningId, copied, baseUrl, handleRenameCommit, handleClone, handleCopy, handleDelete, handleToggleLock, onOpenProject])

  if (loading) return (
    <div className="py-10 flex flex-col items-center gap-4">
      <Spinner />
      <p className="text-white/30 text-xs">Loading projects…</p>
    </div>
  )
  if (error) return (
    <div className="space-y-3">
      <ErrorBanner msg={error} />
      <button onClick={load} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-all">
        <IconRefresh /> Retry
      </button>
    </div>
  )
  if (projects.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <p className="text-white/40 text-sm">No projects yet</p>
      <p className="text-white/20 text-xs">Publish a project from the Admin panel to see it here.</p>
    </div>
  )

  return (
    <div>
      <Toast msg={toast?.msg} type={toast?.type} onDismiss={() => setToast(null)} />
      <div className="divide-y divide-white/[0.08]">
        {groupedProjects.map(({ key, members }) => {
          const root = members[0]
          const isStack = members.length > 1
          const isExpanded = expandedGroups.has(key)

          if (!isStack) {
            return <div key={key}>{renderProjectRow(root)}</div>
          }

          return (
            <div key={key}>
              {/* Group accordion header — no box border, just tint on hover */}
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-orange-500/[0.07] transition-colors text-left"
              >
                <span className="text-white/50"><IconChevron down={isExpanded} /></span>
                <span className="flex-1 text-sm font-semibold text-white/90 truncate">
                  {root.name || <span className="text-amber-400/70 italic">Untitled</span>}
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-500/[0.12] border border-orange-500/[0.20] text-orange-300/70 font-medium flex-shrink-0">
                  {members.length} rounds
                </span>
              </button>

              {/* Expanded sub-rows — indented with left border accent */}
              {isExpanded && (
                <div className="border-l border-orange-500/[0.25] ml-5 divide-y divide-white/[0.08]">
                  {members.map(p => (
                    <div key={p.id}>{renderProjectRow(p)}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Media Storage Tab ─────────────────────────────────────────────────────────
function MediaStorageTab({ projectNames }) {
  const [folders,      setFolders]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [toast,        setToast]        = useState(null)
  const [confirmFile,  setConfirmFile]  = useState(null)
  const [deletingFile, setDeletingFile] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data: rootItems, error: rootErr } = await supabase.storage.from('projects').list()
      if (rootErr) throw new Error(rootErr.message)
      if (!rootItems || rootItems.length === 0) { setFolders([]); setLoading(false); return }

      const folderEntries = rootItems.filter(i => !i.metadata)
      const results = await Promise.all(
        folderEntries.map(async (folder) => {
          const { data: files } = await supabase.storage.from('projects').list(folder.name)
          return { id: folder.name, files: files || [] }
        })
      )
      setFolders(results.filter(f => f.files.length > 0))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDeleteFile = useCallback(async (folderId, fileName) => {
    const path = `${folderId}/${fileName}`
    setDeletingFile(path); setConfirmFile(null); setToast(null)
    const { error: err } = await supabase.storage.from('projects').remove([path])
    if (err) {
      setToast({ msg: `File delete failed: ${err.message}`, type: 'error' })
      setDeletingFile(null)
      return
    }
    await load()
    setDeletingFile(null)
    setToast({ msg: `${fileName} deleted.`, type: 'success' })
  }, [load])

  if (loading) return (
    <div className="py-10 flex flex-col items-center gap-4">
      <Spinner />
      <p className="text-white/30 text-xs">Scanning storage…</p>
    </div>
  )
  if (error) return (
    <div className="space-y-3">
      <ErrorBanner msg={error} />
      <button onClick={load} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-all">
        <IconRefresh /> Retry
      </button>
    </div>
  )
  if (folders.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <p className="text-white/40 text-sm">Storage is empty</p>
      <p className="text-white/20 text-xs">Publish a project to start uploading files.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <Toast msg={toast?.msg} type={toast?.type} onDismiss={() => setToast(null)} />

      {folders.map(folder => {
        const totalSize   = folder.files.reduce((acc, f) => acc + (f.metadata?.size || 0), 0)
        const projectName = projectNames[folder.id]
        return (
          <div key={folder.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white/60">
                  {projectName || <span className="text-amber-400/70">orphaned</span>}
                </span>
                <p className="text-[10px] text-white/25 font-mono truncate">{folder.id}</p>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <span className="text-[10px] text-white/30">{folder.files.length} file{folder.files.length !== 1 ? 's' : ''}</span>
                <p className="text-[10px] text-white/20">{fmtSize(totalSize)}</p>
              </div>
            </div>

            {folder.files.map(file => {
              const path         = `${folder.id}/${file.name}`
              const isConfirming = confirmFile?.path === path
              const isDeleting   = deletingFile === path

              return (
                <div
                  key={file.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/6 text-xs"
                >
                  <span className="text-[9px] font-bold tracking-widest bg-white/8 border border-white/10 text-white/40 rounded px-1 py-0.5 flex-shrink-0">
                    {fmtExt(file.name)}
                  </span>
                  <span className="flex-1 text-white/50 truncate">{file.name}</span>
                  <span className="text-white/25 flex-shrink-0 text-[10px]">{fmtSize(file.metadata?.size)}</span>

                  {isConfirming ? (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleDeleteFile(folder.id, file.name)}
                        disabled={isDeleting}
                        className="px-1.5 py-0.5 rounded bg-red-500/25 hover:bg-red-500/35 border border-red-500/30 text-red-300 text-[10px] font-medium transition-all disabled:opacity-50"
                      >
                        {isDeleting ? '…' : 'Del'}
                      </button>
                      <button
                        onClick={() => setConfirmFile(null)}
                        className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/35 text-[10px] transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmFile({ path, folderId: folder.id, fileName: file.name })}
                      disabled={isDeleting}
                      className="p-1 rounded hover:bg-red-500/15 text-white/20 hover:text-red-400 flex-shrink-0 transition-all disabled:opacity-40"
                      title="Delete file"
                    >
                      {isDeleting ? '…' : <IconTrash />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Dashboard Modal ──────────────────────────────────────────────────────
function ProjectsDashboard({ onClose, onOpenProject }) {
  const [activeTab,    setActiveTab]    = useState('projects')
  const [projectNames, setProjectNames] = useState({})

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleOpenProject = useCallback((project) => {
    onOpenProject(project)
  }, [onOpenProject])

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(p => { map[p.id] = p.name || 'Untitled' })
        setProjectNames(map)
      }
    })
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(12,8,6,0.96)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div>
            <h2 className="text-white/90 font-semibold text-base">Open Stage</h2>
            <p className="text-white/30 text-xs mt-0.5">Select a project or manage storage</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/8 text-white/30 hover:text-white/70 transition-all"
          >
            <IconX />
          </button>
        </div>

        {/* Tabs — minimal underline style, no border box */}
        <div className="flex px-6 border-b border-white/[0.07] flex-shrink-0">
          {[
            { id: 'projects', label: 'Projects' },
            { id: 'storage',  label: 'Media Storage' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 mr-6 text-sm font-medium border-b-2 -mb-px transition-all ${
                activeTab === tab.id
                  ? 'border-orange-400/70 text-orange-300/90'
                  : 'border-transparent text-white/32 hover:text-white/58'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content — no inner border wrapper */}
        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {activeTab === 'projects' && (
            <ProjectsTab onOpenProject={handleOpenProject} onClose={onClose} />
          )}
          {activeTab === 'storage' && (
            <div className="px-6 py-3">
              <MediaStorageTab projectNames={projectNames} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProjectsDashboard

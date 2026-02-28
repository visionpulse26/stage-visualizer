import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconX          = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IconCopy       = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
const IconEdit       = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconTrash      = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconFolderOpen = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"/></svg>
const IconRefresh    = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>

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
      <div className="absolute inset-0 rounded-full border-2 border-t-violet-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
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

// Inline toast shown above the list on delete/rename errors
function Toast({ msg, type = 'error', onDismiss }) {
  if (!msg) return null
  const colors = type === 'error'
    ? 'bg-red-500/15 border-red-500/30 text-red-300'
    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs mb-3 ${colors}`}>
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 flex-shrink-0 mt-0.5">✕</button>
    </div>
  )
}

// ── Projects Tab ──────────────────────────────────────────────────────────────
function ProjectsTab({ onOpenProject }) {
  const [projects,    setProjects]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [toast,       setToast]       = useState(null)   // { msg, type }
  const [editingId,   setEditingId]   = useState(null)
  const [editingName, setEditingName] = useState('')
  const [confirmId,   setConfirmId]   = useState(null)
  const [deletingId,  setDeletingId]  = useState(null)
  const [copied,      setCopied]      = useState(null)

  const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin

  // ── Load — extracted so it can be called after mutations ─────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, created_at, video_url, stage_url, camera_presets, grid_cell_size, scene_config')
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
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: trimmed } : p))
    setEditingId(null)
    const { error: err } = await supabase.from('projects').update({ name: trimmed }).eq('id', id)
    if (err) {
      // Roll back optimistic update and show error
      setToast({ msg: `Rename failed: ${err.message}`, type: 'error' })
      await load()
    }
  }, [editingName, load])

  const handleDelete = useCallback(async (project) => {
    setDeletingId(project.id); setConfirmId(null); setToast(null)

    try {
      // 1. Delete all storage files inside the project folder first
      const { data: files, error: listErr } = await supabase.storage
        .from('projects')
        .list(project.id)

      if (listErr) {
        // Non-fatal — storage folder may not exist yet; log and continue
        console.warn('Storage list warning:', listErr.message)
      } else if (files && files.length > 0) {
        const paths = files.map(f => `${project.id}/${f.name}`)
        const { error: removeErr } = await supabase.storage.from('projects').remove(paths)
        if (removeErr) {
          // Non-fatal — still try to delete the DB row
          console.warn('Storage remove warning:', removeErr.message)
        }
      }

      // 2. Delete the database row — explicitly check the error object.
      //    Supabase does NOT throw on RLS violations; it returns { error }.
      const { error: dbErr } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id)

      if (dbErr) {
        setToast({
          msg: `Delete failed: ${dbErr.message}. Check Supabase RLS (see SQL below).`,
          type: 'error',
        })
        return
      }

      // 3. Re-fetch from DB — source of truth, not filtered local state
      await load()
      setToast({ msg: `"${project.name || 'Untitled'}" deleted.`, type: 'success' })
    } catch (err) {
      setToast({ msg: `Unexpected error: ${err.message}`, type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }, [load])

  if (loading) return <div className="py-10 flex flex-col items-center gap-4"><Spinner /><p className="text-white/30 text-xs">Loading projects…</p></div>
  if (error)   return (
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
    <div className="space-y-2">
      <Toast msg={toast?.msg} type={toast?.type} onDismiss={() => setToast(null)} />

      {projects.map(p => (
        <div
          key={p.id}
          className="bg-white/4 hover:bg-white/6 border border-white/8 rounded-xl p-3.5 space-y-2.5 transition-all"
        >
          {/* Name row */}
          <div className="flex items-center gap-2">
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
                className="flex-1 bg-white/8 border border-white/15 rounded-lg px-2.5 py-1 text-sm text-white/90 focus:outline-none focus:border-violet-500/50"
              />
            ) : (
              <span className="flex-1 text-sm font-medium text-white/80 truncate">
                {p.name || <span className="text-amber-400/70 italic">Untitled</span>}
              </span>
            )}
            <button
              onClick={() => { setEditingId(p.id); setEditingName(p.name || '') }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/25 hover:text-white/60 transition-all"
              title="Rename"
            >
              <IconEdit />
            </button>
          </div>

          {/* Meta */}
          <p className="text-[10px] text-white/25 font-mono truncate">{p.id}</p>
          <p className="text-[11px] text-white/30">Created {fmtDate(p.created_at)}</p>

          {/* Copy links */}
          <div className="flex gap-1.5">
            {[
              { key: `collab-${p.id}`, label: 'Collab', path: `/collab/${p.id}` },
              { key: `view-${p.id}`,   label: 'View',   path: `/view/${p.id}` },
            ].map(({ key, label, path }) => (
              <button
                key={key}
                onClick={() => handleCopy(`${baseUrl}${path}`, key)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 text-[10px] transition-all"
              >
                {copied === key ? <span className="text-emerald-400">✓</span> : <IconCopy />}
                {label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 pt-1 border-t border-white/5">
            {/* Open */}
            <button
              onClick={() => onOpenProject(p)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/20 text-violet-300 text-xs font-medium transition-all"
            >
              <IconFolderOpen />Open
            </button>

            {/* Delete */}
            {confirmId === p.id ? (
              <div className="flex gap-1">
                <button
                  onClick={() => handleDelete(p)}
                  disabled={deletingId === p.id}
                  className="px-2.5 py-1.5 rounded-lg bg-red-500/25 hover:bg-red-500/35 border border-red-500/30 text-red-300 text-xs font-medium transition-all disabled:opacity-50"
                >
                  {deletingId === p.id ? '…' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 text-xs transition-all"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(p.id)}
                disabled={deletingId === p.id}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/8 hover:bg-red-500/18 border border-red-500/15 text-red-400/60 hover:text-red-400 text-xs transition-all disabled:opacity-40"
                title="Delete project"
              >
                {deletingId === p.id ? '…' : <IconTrash />}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Media Storage Tab ─────────────────────────────────────────────────────────
function MediaStorageTab({ projectNames }) {
  const [folders,     setFolders]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [toast,       setToast]       = useState(null)
  const [confirmFile, setConfirmFile] = useState(null)   // { path, folderId, fileName }
  const [deletingFile, setDeletingFile] = useState(null)

  // ── Load — extracted so it can be called after file deletions ────────────
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

    // Re-fetch storage to confirm — don't just filter local state
    await load()
    setDeletingFile(null)
    setToast({ msg: `${fileName} deleted.`, type: 'success' })
  }, [load])

  if (loading) return <div className="py-10 flex flex-col items-center gap-4"><Spinner /><p className="text-white/30 text-xs">Scanning storage…</p></div>
  if (error)   return (
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
        const totalSize  = folder.files.reduce((acc, f) => acc + (f.metadata?.size || 0), 0)
        const projectName = projectNames[folder.id]
        return (
          <div key={folder.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
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

// ── RLS Info Banner ────────────────────────────────────────────────────────────
function RlsBanner() {
  const [open, setOpen] = useState(false)
  const sql = `-- Run this in Supabase → SQL Editor to allow project deletion:
CREATE POLICY "Allow delete" ON projects
FOR DELETE USING (true);

-- Also allow storage deletions (if using RLS on storage):
-- Storage uses bucket-level policies in the Supabase dashboard.
-- Go to Storage → projects bucket → Policies → Add DELETE policy.`

  return (
    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left text-xs text-amber-300/70 hover:text-amber-300 transition-all"
      >
        <span>⚠ If deletes fail, check Supabase RLS</span>
        <span className="text-[10px] opacity-60">{open ? '▲ hide' : '▼ show SQL'}</span>
      </button>
      {open && (
        <pre className="px-4 pb-4 text-[10px] text-amber-200/50 font-mono whitespace-pre-wrap leading-relaxed">
          {sql}
        </pre>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
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

  // Load project names once to help the Media Storage tab label orphaned folders
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
          background: 'rgba(10,10,20,0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 flex-shrink-0">
          <div>
            <h2 className="text-white/90 font-semibold text-base">Project Manager</h2>
            <p className="text-white/30 text-xs mt-0.5">Manage published projects and storage files</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/8 text-white/30 hover:text-white/70 transition-all"
          >
            <IconX />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8 px-6 flex-shrink-0">
          {[
            { id: 'projects', label: '📝 Projects' },
            { id: 'storage',  label: '🗄️ Media Storage' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-violet-400 text-violet-300'
                  : 'border-transparent text-white/35 hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          {activeTab === 'projects' && (
            <>
              <ProjectsTab onOpenProject={handleOpenProject} />
              <RlsBanner />
            </>
          )}
          {activeTab === 'storage' && (
            <MediaStorageTab projectNames={projectNames} />
          )}
        </div>
      </div>
    </div>
  )
}

export default ProjectsDashboard

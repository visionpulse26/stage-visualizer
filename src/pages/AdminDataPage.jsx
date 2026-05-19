import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Database, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { fetchAdminScan, postDeleteR2Keys, postProjectMutate } from '../utils/adminDataApi'

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const gb = n / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = n / (1024 ** 2)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = n / 1024
  return `${kb < 1 ? n.toFixed(0) : kb.toFixed(1)} KB`
}

function hasStage(p) {
  return Boolean(p.stage_url)
}

function hasHdri(p) {
  const u = p.scene_config?.customHdriUrl
  return Boolean(u && String(u).trim())
}

function mediaCount(p) {
  const pl = p.media_playlist
  return Array.isArray(pl) ? pl.length : 0
}

function statusLabel(p) {
  if (p.deleted_at) return 'soft-deleted'
  if (p.is_client_locked) return 'locked'
  return 'active'
}

export default function AdminDataPage() {
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [orphanSel, setOrphanSel] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminScan()
      setScan(data)
      setSelected(new Set())
      setOrphanSel(new Set())
    } catch (e) {
      setError(e.message || String(e))
      setScan(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const projects = scan?.projects ?? []
  const orphaned = scan?.orphaned_keys ?? []
  const summary = scan?.summary ?? {}
  const orphanAnalytics = scan?.orphan_analytics_by_table ?? {}

  const totalOrphanAnalytics = useMemo(
    () => Object.values(orphanAnalytics).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0),
    [orphanAnalytics],
  )

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleOrphan = (key) => {
    setOrphanSel((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const confirm = (title, detail) => window.confirm(`${title}\n\n${detail}`)

  const onDeleteFilesOnly = async (p) => {
    const n = p.r2_files?.length ?? 0
    const bytes = p.r2_size_bytes ?? 0
    if (
      !confirm(
        'Delete R2 files only?',
        `Project: ${p.name || p.id}\n${n} object(s), ${formatBytes(bytes)} will be removed from R2.\nURLs in the database will be cleared. Analytics rows are kept.`,
      )
    ) {
      return
    }
    await postProjectMutate({ action: 'delete_files_only', projectId: p.id })
    await load()
  }

  const onHardDelete = async (p) => {
    const n = p.r2_files?.length ?? 0
    const bytes = p.r2_size_bytes ?? 0
    const ar = p.db_analytics_rows ?? 0
    if (
      !confirm(
        'Hard delete entire project?',
        `Project: ${p.name || p.id}\nThis removes the database row, ${n} R2 object(s) (${formatBytes(bytes)}), and about ${ar} analytics-related rows. This cannot be undone.`,
      )
    ) {
      return
    }
    await postProjectMutate({ action: 'hard_delete_all', projectId: p.id })
    await load()
  }

  const onSoftDelete = async (p) => {
    if (!confirm('Soft delete project?', `Project: ${p.name || p.id}\nSets deleted_at. R2 and analytics are kept.`)) return
    await postProjectMutate({ action: 'soft_delete', projectId: p.id })
    await load()
  }

  const onRestore = async (p) => {
    if (!confirm('Restore project?', `Project: ${p.name || p.id}\nClears deleted_at.`)) return
    await postProjectMutate({ action: 'restore', projectId: p.id })
    await load()
  }

  const onBulkDeleteFiles = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (
      !confirm(
        'Delete R2 files for selected projects?',
        `${ids.length} project(s). Database URLs cleared; analytics kept.`,
      )
    ) {
      return
    }
    await postProjectMutate({ action: 'delete_files_only_bulk', projectIds: ids })
    await load()
  }

  const onDeleteOrphans = async () => {
    const keys = [...orphanSel]
    if (keys.length === 0) return
    const bytes = orphaned.filter((o) => keys.includes(o.key)).reduce((s, o) => s + (o.size || 0), 0)
    if (
      !confirm(
        'Delete orphaned R2 objects?',
        `${keys.length} object(s), ~${formatBytes(bytes)}. No database rows are modified.`,
      )
    ) {
      return
    }
    await postDeleteR2Keys(keys)
    await load()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#080604] text-[#e8e0d8]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#080604]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[11px] uppercase tracking-wider text-white/70 hover:border-[#E8531A]/50 hover:text-[#E8531A]"
          >
            <ArrowLeft size={14} /> Admin
          </button>
          <div className="flex items-center gap-2">
            <Database size={18} className="text-[#E8531A]" />
            <span className="font-semibold tracking-wide" style={{ fontFamily: 'Chakra Petch, sans-serif' }}>
              Data & storage
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => load()}
            className="inline-flex items-center gap-1 rounded border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Scan now
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-6" style={{ fontFamily: 'Chakra Petch, sans-serif' }}>
        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {!error && scan?.notice && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 leading-relaxed">
            {scan.notice}
          </div>
        )}

        {!loading && !error && scan && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Total R2</div>
              <div className="text-lg font-semibold text-[#E8531A]">{formatBytes(scan.total_r2_bytes)}</div>
              <div className="text-[11px] text-white/45">{scan.total_r2_files ?? 0} objects</div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Projects</div>
              <div className="text-lg font-semibold">{projects.length}</div>
              <div className="text-[11px] text-white/45">
                {summary.active_projects ?? 0} active · {summary.soft_deleted_projects ?? 0} soft-deleted
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Orphan R2</div>
              <div className="text-lg font-semibold">{orphaned.length}</div>
              <div className="text-[11px] text-white/45">
                {summary.projects_with_orphan_r2 ?? 0} projects with unreferenced files
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Orphan analytics rows</div>
              <div className="text-lg font-semibold">{totalOrphanAnalytics}</div>
              <div className="text-[11px] text-white/45">Across 6 tables (see network payload)</div>
            </div>
          </section>
        )}

        {loading && (
          <p className="text-center text-sm text-white/40">Scanning Supabase and R2…</p>
        )}

        {!loading && scan && (
          <>
            <section className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={onBulkDeleteFiles}
                className="inline-flex items-center gap-1 rounded bg-[#E8531A]/20 px-3 py-2 text-xs font-medium text-[#E8531A] hover:bg-[#E8531A]/30 disabled:opacity-30"
              >
                <Trash2 size={14} /> Delete R2 files for selected ({selected.size})
              </button>
            </section>

            <div className="overflow-x-auto rounded border border-white/10">
              <table className="w-full min-w-[800px] text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/45">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Project</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Stage</th>
                    <th className="px-2 py-2">HDRI</th>
                    <th className="px-2 py-2">Media</th>
                    <th className="px-2 py-2">R2 size</th>
                    <th className="px-2 py-2">Analytics</th>
                    <th className="px-2 py-2">Orphan?</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleRow(p.id)}
                          className="accent-[#E8531A]"
                        />
                      </td>
                      <td className="max-w-[200px] truncate px-2 py-2 font-medium text-white/90" title={p.name}>
                        {p.name || p.id}
                      </td>
                      <td className="px-2 py-2 text-white/55">{statusLabel(p)}</td>
                      <td className="px-2 py-2">{hasStage(p) ? '✓' : '—'}</td>
                      <td className="px-2 py-2">{hasHdri(p) ? '✓' : '—'}</td>
                      <td className="px-2 py-2">{mediaCount(p)}</td>
                      <td className="px-2 py-2">{formatBytes(p.r2_size_bytes)}</td>
                      <td className="px-2 py-2">{p.db_analytics_rows ?? 0}</td>
                      <td className="px-2 py-2">{p.has_orphan_r2 ? 'yes' : '—'}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:border-[#E8531A]/40"
                            onClick={() => onDeleteFilesOnly(p)}
                          >
                            Files only
                          </button>
                          {p.deleted_at ? (
                            <button
                              type="button"
                              className="rounded border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:border-emerald-500/40"
                              onClick={() => onRestore(p)}
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:border-amber-500/40"
                              onClick={() => onSoftDelete(p)}
                            >
                              Soft delete
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded border border-red-500/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-300/90 hover:bg-red-500/10"
                            onClick={() => onHardDelete(p)}
                          >
                            Hard delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Orphaned R2 objects</h2>
              <p className="text-[11px] text-white/40">
                Objects not referenced by any project URL in the database (stage, HDRI, media, thumbnails).
              </p>
              {orphaned.length === 0 ? (
                <p className="text-sm text-white/35">None detected.</p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={orphanSel.size === 0}
                    onClick={onDeleteOrphans}
                    className="inline-flex items-center gap-1 rounded bg-red-500/15 px-3 py-2 text-xs text-red-200 hover:bg-red-500/25 disabled:opacity-30"
                  >
                    <Trash2 size={14} /> Delete selected orphans ({orphanSel.size})
                  </button>
                  <div className="max-h-[320px] overflow-y-auto rounded border border-white/10">
                    <ul className="divide-y divide-white/5 text-[11px]">
                      {orphaned.map((o) => (
                        <li key={o.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.02]">
                          <input
                            type="checkbox"
                            checked={orphanSel.has(o.key)}
                            onChange={() => toggleOrphan(o.key)}
                            className="accent-[#E8531A]"
                          />
                          <span className="flex-1 truncate font-mono text-white/70" title={o.key}>{o.key}</span>
                          <span className="text-white/40">{formatBytes(o.size)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

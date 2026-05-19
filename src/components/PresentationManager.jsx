import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, FolderOpen, RefreshCw, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

function formatDate(value) {
  if (!value) return 'not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'not set'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function SmallButton({ children, onClick, disabled = false, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-semibold transition-all ${
        primary
          ? 'border-violet-500/25 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
          : 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  )
}

function ProjectPresentationCard({ item, feedbackCount, onOpenEditor, onOpenClientView }) {
  const { project, draft, published } = item

  return (
    <section className="rounded-xl border border-white/14 bg-white/4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-semibold leading-tight text-white/90">{project.name}</h3>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/36">
            <span>{draft ? `Draft v${draft.version_number}` : 'No draft'}</span>
            <span>
              {published
                ? `Live published v${published.version_number} - ${formatDate(published.published_at || published.updated_at)}`
                : 'No live published version'}
            </span>
            <span>{feedbackCount} feedback</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SmallButton primary onClick={() => onOpenEditor(project.id)}>
            <FolderOpen size={12} /> Editor
          </SmallButton>
          <SmallButton disabled={!published} onClick={() => published && onOpenClientView(project.id)}>
            <Eye size={12} /> Client View
          </SmallButton>
        </div>
      </div>
    </section>
  )
}

export default function PresentationManager({ onClose, onOpenEditor }) {
  const [projects, setProjects] = useState([])
  const [versions, setVersions] = useState([])
  const [feedbackCounts, setFeedbackCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [{ data: projectRows, error: projectError }, { data: versionRows, error: versionError }] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, stage_url, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('presentation_versions')
          .select('id, project_id, version_number, version_name, status, created_at, updated_at, published_at')
          .in('status', ['draft', 'published'])
          .order('updated_at', { ascending: false }),
      ])

      if (projectError) throw projectError
      if (versionError) throw versionError

      const { data: feedbackRows, error: feedbackError } = await supabase
        .from('client_feedback_items')
        .select('id, project_id')

      const byProject = {}
      if (!feedbackError) {
        for (const item of feedbackRows || []) {
          byProject[item.project_id] = (byProject[item.project_id] || 0) + 1
        }
      }

      setProjects(projectRows || [])
      setVersions(versionRows || [])
      setFeedbackCounts(byProject)
    } catch (err) {
      setError(err.message || 'Unable to load presentations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const grouped = useMemo(() => {
    const projectById = new Map(projects.map((project) => [project.id, {
      ...project,
      name: project.name || 'Untitled stage',
    }]))
    const versionsByProject = new Map()

    for (const version of versions) {
      const next = versionsByProject.get(version.project_id) || []
      next.push(version)
      versionsByProject.set(version.project_id, next)
    }

    return Array.from(versionsByProject.entries())
      .map(([projectId, rows]) => {
        const draft = rows
          .filter((version) => version.status === 'draft')
          .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))[0] || null
        const published = rows.find((version) => version.status === 'published') || null
        return {
          project: projectById.get(projectId) || { id: projectId, name: 'Unknown stage' },
          draft,
          published,
          lastTouched: Math.max(...rows.map((row) => new Date(row.updated_at || row.created_at || 0).getTime())),
        }
      })
      .sort((a, b) => b.lastTouched - a.lastTouched)
  }, [projects, versions])

  const openClientView = useCallback((projectId) => {
    window.open(`/view/${projectId}`, '_blank', 'noopener,noreferrer')
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        style={{
          background: 'rgba(10,10,20,0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white/90">Presentation Manager</h2>
            <p className="mt-0.5 text-xs text-white/30">Open the current draft editor or view the live published client page</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/30 transition-all hover:bg-white/8 hover:text-white/70"
            aria-label="Close presentation manager"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="py-12 text-center text-sm text-white/35">Loading presentations...</div>
          )}

          {!loading && !grouped.length && (
            <div className="rounded-xl border border-dashed border-white/12 px-4 py-10 text-center">
              <p className="text-sm text-white/45">No presentations yet</p>
              <p className="mt-1 text-xs text-white/25">Open a ready stage and save a presentation draft first.</p>
            </div>
          )}

          {!loading && grouped.length > 0 && (
            <div className="space-y-3">
              {grouped.map((item) => (
                <ProjectPresentationCard
                  key={item.project.id}
                  item={item}
                  feedbackCount={feedbackCounts[item.project.id] || 0}
                  onOpenEditor={onOpenEditor}
                  onOpenClientView={openClientView}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-white/8 px-6 py-3">
          <span className="text-[10px] text-white/28">Version history stays inside the presentation editor.</span>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-white/45 hover:bg-white/10 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>
    </div>
  )
}

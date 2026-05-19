import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, FolderOpen, LogOut, Plus, RefreshCw } from 'lucide-react'
import ProjectsDashboard from '../components/ProjectsDashboard'
import PresentationManager from '../components/PresentationManager'
import { supabase } from '../lib/supabaseClient'

const BRAND = {
  orange: '#FF5500',
  orangeDeep: '#FF3300',
  orangeBg1: '#FF4500',
  orangeBg2: '#FF6A00',
  hexStroke: '#CC3300',
}

function GateBackground() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      background: `linear-gradient(135deg, ${BRAND.orangeBg1} 0%, ${BRAND.orangeBg2} 100%)`,
      overflow: 'hidden',
    }}>
      <svg
        viewBox="0 0 1440 900"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="adminBlob1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CC2200" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#CC2200" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="adminBlob2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CC2200" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#CC2200" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="200" cy="300" rx="340" ry="280" fill="url(#adminBlob1)" />
        <ellipse cx="1200" cy="600" rx="300" ry="260" fill="url(#adminBlob2)" />
        <polygon points="-60,80 160,-40 380,80 380,320 160,440 -60,320" stroke={BRAND.hexStroke} strokeOpacity="0.1" strokeWidth="2.5" fill="none" />
        <polygon points="980,340 1200,220 1420,340 1420,580 1200,700 980,580" stroke={BRAND.hexStroke} strokeOpacity="0.1" strokeWidth="2.5" fill="none" />
        <polygon points="400,560 560,470 720,560 720,740 560,830 400,740" stroke={BRAND.hexStroke} strokeOpacity="0.07" strokeWidth="2" fill="none" />
        <polygon points="1050,60 1200,180 1050,300 900,180" stroke={BRAND.hexStroke} strokeOpacity="0.08" strokeWidth="2" fill="none" />
        <polygon points="150,600 280,700 150,800 20,700" stroke={BRAND.hexStroke} strokeOpacity="0.08" strokeWidth="2" fill="none" />
        <rect x="80" y="22" width="60" height="12" rx="6" fill="#1a0800" fillOpacity="0.5" />
        <rect x="1300" y="22" width="60" height="12" rx="6" fill="#1a0800" fillOpacity="0.5" />
      </svg>
      <div style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        opacity: 0.5,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `1.5px solid ${BRAND.hexStroke}`,
          background: 'rgba(26,8,0,0.3)',
        }} />
        <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#CC3300', textTransform: 'uppercase' }}>SINCE 2023</span>
      </div>
    </div>
  )
}

function BrandMark() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: `2px solid ${BRAND.orange}`,
        background: 'rgba(255,85,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: BRAND.orange }}>SV</span>
      </div>
      <span style={{
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        color: '#FF7733',
      }}>
        Stage Visualizer
      </span>
    </div>
  )
}

function ActionButton({ icon, label, detail, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="admin-landing-action"
    >
      <span className="admin-landing-action-icon">{icon}</span>
      <span className="admin-landing-action-copy">
        <span className="admin-landing-action-label">{label}</span>
        <span className="admin-landing-action-detail">{detail}</span>
      </span>
      <ArrowRight size={16} className="admin-landing-action-arrow" />
    </button>
  )
}

function ProjectRow({ project, onOpenStage, onOpenPresentation }) {
  const stageReady = Boolean(project.stage_url)
  const draftCount = project.draftCount ?? 0

  return (
    <div className="admin-landing-row">
      <div className="admin-landing-row-main">
        <span className="admin-landing-row-title">{project.name || 'Untitled stage'}</span>
        <span className="admin-landing-row-meta">
          {stageReady ? 'Stage ready' : 'Setup stage first'}
          {draftCount > 0 ? ` - ${draftCount} draft${draftCount > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      <div className="admin-landing-row-actions">
        <button type="button" onClick={() => onOpenStage(project.id)}>Stage</button>
        <button type="button" onClick={() => onOpenPresentation(project.id)} disabled={!stageReady}>
          {stageReady ? 'Presentation' : 'Locked'}
        </button>
      </div>
    </div>
  )
}

function RecentPresentationRow({ draft, onOpen }) {
  return (
    <button type="button" className="admin-landing-recent" onClick={() => onOpen(draft.project_id)}>
      <span>
        <span className="admin-landing-row-title">{draft.projectName || 'Untitled stage'}</span>
        <span className="admin-landing-row-meta">
          Draft v{draft.version_number ?? '-'} - {formatRelative(draft.updated_at || draft.created_at)}
        </span>
      </span>
      <ArrowRight size={15} />
    </button>
  )
}

export default function AdminLandingPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showProjectManager, setShowProjectManager] = useState(false)
  const [showPresentationManager, setShowPresentationManager] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: projectRows, error: projectError } = await supabase
        .from('projects')
        .select('id, name, stage_url, created_at')
        .order('created_at', { ascending: false })
        .limit(12)
      if (projectError) throw projectError

      let draftRows = []
      const { data: draftData, error: draftError } = await supabase
        .from('presentation_versions')
        .select('id, project_id, version_number, version_name, updated_at, created_at, status')
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(6)

      if (!draftError) draftRows = draftData || []

      const projectNameById = new Map((projectRows || []).map((p) => [p.id, p.name || 'Untitled stage']))
      const draftCountByProject = draftRows.reduce((acc, draft) => {
        acc[draft.project_id] = (acc[draft.project_id] || 0) + 1
        return acc
      }, {})

      setProjects((projectRows || []).map((project) => ({
        ...project,
        draftCount: draftCountByProject[project.id] || 0,
      })))
      setDrafts(draftRows.map((draft) => ({
        ...draft,
        projectName: projectNameById.get(draft.project_id) || draft.version_name || 'Untitled stage',
      })))
    } catch (err) {
      setError(err.message || 'Unable to load admin workspace.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const readyProjects = useMemo(() => projects.filter((project) => project.stage_url), [projects])

  const openStage = useCallback((projectId) => {
    navigate(projectId ? `/admin/stage/${projectId}` : '/admin/stage')
  }, [navigate])

  const openManagedStage = useCallback((project) => {
    setShowProjectManager(false)
    openStage(project?.id)
  }, [openStage])

  const openPresentation = useCallback((projectId) => {
    navigate(`/admin/${projectId}/presentation`)
  }, [navigate])

  const openManagedPresentation = useCallback((projectId) => {
    setShowPresentationManager(false)
    openPresentation(projectId)
  }, [openPresentation])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }, [navigate])

  return (
    <div className="admin-landing-shell">
      <GateBackground />
      <style>{`
        @keyframes adminLandingIn {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .admin-landing-shell {
          position: relative;
          width: 100%;
          min-height: 100vh;
          overflow-y: auto;
          font-family: 'Chakra Petch', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 18px;
        }
        .admin-landing-panel {
          position: relative;
          z-index: 1;
          width: min(760px, calc(100vw - 32px));
          max-height: calc(100vh - 64px);
          overflow-y: auto;
          background: rgba(8, 6, 6, 0.80);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 34px 34px 30px;
          box-shadow: 0 0 60px rgba(255,80,0,0.22), 0 24px 48px rgba(0,0,0,0.55);
          animation: adminLandingIn 0.35s cubic-bezier(0.22,1,0.36,1) both;
        }
        .admin-landing-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }
        .admin-landing-kicker {
          margin-top: 18px;
          font-size: 11px;
          color: rgba(255,119,51,0.92);
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .admin-landing-title {
          margin-top: 8px;
          font-size: 28px;
          line-height: 1.15;
          color: #fff;
          font-weight: 760;
        }
        .admin-landing-subtitle {
          margin-top: 8px;
          max-width: 520px;
          font-size: 13px;
          line-height: 1.55;
          color: rgba(255,255,255,0.54);
        }
        .admin-landing-signout {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          padding: 0 11px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.52);
          font-size: 11px;
          cursor: pointer;
        }
        .admin-landing-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 28px;
        }
        .admin-landing-action {
          min-height: 132px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,85,0,0.22);
          background: rgba(255,255,255,0.055);
          color: #fff;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.12s;
        }
        .admin-landing-action:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(255,85,0,0.58);
          background: rgba(255,85,0,0.12);
        }
        .admin-landing-action-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,85,0,0.14);
          color: #FF7733;
        }
        .admin-landing-action-copy {
          display: flex;
          flex-direction: column;
          gap: 5px;
          flex: 1;
        }
        .admin-landing-action-label {
          font-size: 14px;
          font-weight: 740;
        }
        .admin-landing-action-detail {
          font-size: 10px;
          line-height: 1.45;
          color: rgba(255,255,255,0.44);
        }
        .admin-landing-action-arrow {
          color: rgba(255,119,51,0.9);
          align-self: flex-end;
        }
        .admin-landing-rule {
          margin-top: 16px;
          border-radius: 10px;
          border: 1px solid rgba(255,85,0,0.20);
          background: rgba(255,85,0,0.08);
          padding: 10px 12px;
          font-size: 10px;
          line-height: 1.45;
          color: rgba(255,255,255,0.50);
        }
        .admin-landing-content {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
          gap: 14px;
          margin-top: 18px;
        }
        .admin-landing-section-title {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 8px;
          font-size: 10px;
          color: rgba(255,255,255,0.40);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .admin-landing-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .admin-landing-row,
        .admin-landing-recent {
          width: 100%;
          min-height: 54px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.045);
          padding: 10px 11px;
          color: #fff;
        }
        .admin-landing-recent {
          cursor: pointer;
          text-align: left;
        }
        .admin-landing-recent:hover {
          border-color: rgba(255,85,0,0.34);
          background: rgba(255,85,0,0.09);
        }
        .admin-landing-row-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .admin-landing-row-title {
          display: block;
          font-size: 12px;
          color: rgba(255,255,255,0.82);
          font-weight: 650;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-landing-row-meta {
          display: block;
          font-size: 9px;
          color: rgba(255,255,255,0.34);
        }
        .admin-landing-row-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .admin-landing-row-actions button {
          height: 28px;
          padding: 0 9px;
          border-radius: 8px;
          border: 1px solid rgba(255,85,0,0.22);
          background: rgba(255,85,0,0.08);
          color: rgba(255,214,196,0.86);
          font-size: 10px;
          cursor: pointer;
        }
        .admin-landing-row-actions button:disabled {
          opacity: 0.42;
          cursor: not-allowed;
          border-color: rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.36);
        }
        .admin-landing-empty,
        .admin-landing-error {
          border-radius: 10px;
          border: 1px dashed rgba(255,255,255,0.10);
          padding: 14px;
          color: rgba(255,255,255,0.34);
          font-size: 11px;
          line-height: 1.5;
        }
        .admin-landing-error {
          border-color: rgba(255,80,80,0.28);
          color: rgba(255,150,130,0.78);
        }
        .admin-landing-refresh {
          margin-top: 9px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: rgba(255,119,51,0.9);
          background: none;
          border: 0;
          font-size: 11px;
          cursor: pointer;
        }
        @media (max-width: 760px) {
          .admin-landing-shell {
            align-items: flex-start;
            padding: 18px 12px 28px;
          }
          .admin-landing-panel {
            width: 100%;
            max-height: none;
            padding: 28px 18px 24px;
          }
          .admin-landing-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          .admin-landing-signout {
            position: absolute;
            top: 14px;
            right: 14px;
          }
          .admin-landing-actions,
          .admin-landing-content {
            grid-template-columns: 1fr;
          }
          .admin-landing-action {
            min-height: 96px;
          }
          .admin-landing-row {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <main className="admin-landing-panel">
        <div className="admin-landing-header">
          <div style={{ flex: 1 }}>
            <BrandMark />
            <div className="admin-landing-kicker">Admin workspace</div>
            <h1 className="admin-landing-title">Choose where to continue.</h1>
            <p className="admin-landing-subtitle">
              Build the stage first, then hand off the presentation work for clips, notes, feedback, and version publishing.
            </p>
          </div>
          <button type="button" className="admin-landing-signout" onClick={handleSignOut}>
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <div className="admin-landing-actions">
          <ActionButton
            icon={<Plus size={18} />}
            label="New Stage"
            detail="Start a blank stage setup for GLB, camera, lighting, and publish."
            onClick={() => openStage(null)}
          />
          <ActionButton
            icon={<FolderOpen size={18} />}
            label="Open Stage"
            detail="Return to stage setup for an existing project."
            onClick={() => setShowProjectManager(true)}
          />
          <ActionButton
            icon={<Clock3 size={18} />}
            label="Recent Presentation"
            detail="Manage drafts, published versions, and restores."
            onClick={() => setShowPresentationManager(true)}
          />
        </div>

        <div className="admin-landing-rule">
          Presentation stays locked until a project has a stage file. If a row says "Setup stage first", open Stage before assigning clips or notes.
        </div>

        {error && (
          <div className="admin-landing-error" style={{ marginTop: 14 }}>
            {error}
            <button type="button" className="admin-landing-refresh" onClick={load}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        <div className="admin-landing-content">
          <section id="admin-open-stage-list">
            <div className="admin-landing-section-title"><FolderOpen size={13} /> Open Stage</div>
            <div className="admin-landing-list">
              {loading && <div className="admin-landing-empty">Loading stages...</div>}
              {!loading && !projects.length && <div className="admin-landing-empty">No stages yet. Start with New Stage.</div>}
              {!loading && projects.slice(0, 5).map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onOpenStage={openStage}
                  onOpenPresentation={openPresentation}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="admin-landing-section-title"><Clock3 size={13} /> Recent Presentation</div>
            <div className="admin-landing-list">
              {loading && <div className="admin-landing-empty">Loading drafts...</div>}
              {!loading && !drafts.length && (
                <div className="admin-landing-empty">
                  No presentation drafts yet. {readyProjects.length ? 'Open a ready stage to begin.' : 'Create and publish a stage first.'}
                </div>
              )}
              {!loading && drafts.map((draft) => (
                <RecentPresentationRow key={draft.id} draft={draft} onOpen={openPresentation} />
              ))}
            </div>
          </section>
        </div>
      </main>

      {showProjectManager && (
        <ProjectsDashboard
          onClose={() => setShowProjectManager(false)}
          onOpenProject={openManagedStage}
        />
      )}

      {showPresentationManager && (
        <PresentationManager
          onClose={() => setShowPresentationManager(false)}
          onOpenEditor={openManagedPresentation}
        />
      )}
    </div>
  )
}

function formatRelative(ts) {
  if (!ts) return 'recently'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.max(0, Math.floor(diff / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

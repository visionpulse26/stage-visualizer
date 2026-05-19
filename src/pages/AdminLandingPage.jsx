import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, Database, FolderOpen, LogOut, Plus, RefreshCw } from 'lucide-react'
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
      <ArrowRight size={15} className="admin-landing-action-arrow" />
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
          {draftCount > 0 ? ` · ${draftCount} draft${draftCount > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      <div className="admin-landing-row-actions">
        <button type="button" onClick={() => onOpenStage(project.id)}>Stage</button>
        <button type="button" onClick={() => onOpenPresentation(project.id)} disabled={!stageReady}>
          {stageReady ? 'Present' : 'Locked'}
        </button>
      </div>
    </div>
  )
}

export default function AdminLandingPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
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
        .select('id, project_id, version_number, updated_at, status')
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(20)

      if (!draftError) draftRows = draftData || []

      const draftCountByProject = draftRows.reduce((acc, draft) => {
        acc[draft.project_id] = (acc[draft.project_id] || 0) + 1
        return acc
      }, {})

      setProjects((projectRows || []).map((project) => ({
        ...project,
        draftCount: draftCountByProject[project.id] || 0,
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

  const openDataPanel = useCallback(() => {
    navigate('/admin/data')
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
          from { opacity: 0; transform: translateY(20px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)   scale(1);     }
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
        .admin-landing-signout {
          position: fixed;
          top: 18px;
          right: 22px;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 30px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.28);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: rgba(255,255,255,0.42);
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .admin-landing-signout:hover {
          color: rgba(255,255,255,0.72);
          border-color: rgba(255,255,255,0.20);
          background: rgba(0,0,0,0.42);
        }
        .admin-landing-panel {
          position: relative;
          z-index: 1;
          width: min(920px, calc(100vw - 32px));
          background: rgba(8,6,6,0.82);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 36px 36px 32px;
          box-shadow: 0 0 60px rgba(255,80,0,0.20), 0 24px 48px rgba(0,0,0,0.55);
          animation: adminLandingIn 0.35s cubic-bezier(0.22,1,0.36,1) both;
        }
        .admin-landing-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .admin-landing-kicker {
          margin-top: 14px;
          font-size: 10px;
          color: rgba(255,119,51,0.72);
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .admin-landing-title {
          margin-top: 7px;
          font-size: 26px;
          line-height: 1.15;
          color: #fff;
          font-weight: 760;
        }
        .admin-landing-actions {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 26px;
        }
        .admin-landing-action {
          min-height: 112px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
          padding: 15px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,85,0,0.16);
          background: rgba(255,255,255,0.065);
          color: #fff;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.18s, background 0.18s, transform 0.14s, box-shadow 0.18s;
        }
        .admin-landing-action:hover:not(:disabled) {
          transform: translateY(-2px);
          border-color: rgba(255,85,0,0.52);
          background: rgba(255,85,0,0.11);
          box-shadow: 0 8px 20px rgba(255,85,0,0.10);
        }
        .admin-landing-action:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .admin-landing-action-icon {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,85,0,0.14);
          color: #FF7733;
          flex-shrink: 0;
        }
        .admin-landing-action-copy {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .admin-landing-action-label {
          font-size: 13px;
          font-weight: 740;
          line-height: 1.2;
        }
        .admin-landing-action-detail {
          font-size: 10px;
          line-height: 1.45;
          color: rgba(255,255,255,0.40);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .admin-landing-action-arrow {
          color: rgba(255,119,51,0.60);
          align-self: flex-end;
          margin-top: auto;
        }
        .admin-landing-inline-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .admin-landing-row {
          width: 100%;
          min-height: 50px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.04);
          padding: 9px 11px;
          color: #fff;
        }
        .admin-landing-row-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
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
          color: rgba(255,255,255,0.30);
          letter-spacing: 0.02em;
        }
        .admin-landing-row-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .admin-landing-row-actions button {
          height: 26px;
          padding: 0 9px;
          border-radius: 7px;
          border: 1px solid rgba(255,85,0,0.20);
          background: rgba(255,85,0,0.07);
          color: rgba(255,214,196,0.82);
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .admin-landing-row-actions button:hover:not(:disabled) {
          border-color: rgba(255,85,0,0.40);
          background: rgba(255,85,0,0.14);
        }
        .admin-landing-row-actions button:disabled {
          opacity: 0.40;
          cursor: not-allowed;
          border-color: rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.32);
        }
        .admin-landing-error {
          margin-top: 12px;
          border-radius: 9px;
          border: 1px solid rgba(255,80,80,0.22);
          background: rgba(255,50,50,0.06);
          padding: 10px 12px;
          color: rgba(255,150,130,0.78);
          font-size: 11px;
          line-height: 1.5;
        }
        .admin-landing-refresh {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: rgba(255,119,51,0.9);
          background: none;
          border: 0;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
        }
        @media (max-width: 820px) {
          .admin-landing-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .admin-landing-shell {
            align-items: flex-start;
            padding: 18px 12px 28px;
          }
          .admin-landing-panel {
            width: 100%;
            padding: 28px 18px 24px;
          }
          .admin-landing-actions {
            grid-template-columns: 1fr;
          }
          .admin-landing-action {
            min-height: 80px;
          }
          .admin-landing-row {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>

      {/* Sign out — fixed at viewport top-right, outside the card */}
      <button type="button" className="admin-landing-signout" onClick={handleSignOut}>
        <LogOut size={12} /> Sign out
      </button>

      <main className="admin-landing-panel">
        <div className="admin-landing-header">
          <BrandMark />
          <div className="admin-landing-kicker">Admin workspace</div>
          <h1 className="admin-landing-title">Choose where to continue.</h1>
        </div>

        <div className="admin-landing-actions">
          <ActionButton
            icon={<Plus size={18} />}
            label="New Stage"
            detail="Blank stage — GLB, camera, lights, publish."
            onClick={() => openStage(null)}
          />
          <ActionButton
            icon={<FolderOpen size={18} />}
            label="Open Stage"
            detail="Return to an existing project's stage setup."
            onClick={() => setShowProjectManager(true)}
          />
          <ActionButton
            icon={<Clock3 size={18} />}
            label="Open Presentation"
            detail="Manage drafts, versions, and restores."
            onClick={() => setShowPresentationManager(true)}
          />
          <ActionButton
            icon={<Database size={18} />}
            label="Data & storage"
            detail="Scan R2, analytics footprint, and destructive cleanup."
            onClick={openDataPanel}
          />
        </div>

        {!loading && projects.length > 0 && (
          <div className="admin-landing-inline-list">
            {projects.slice(0, 5).map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onOpenStage={openStage}
                onOpenPresentation={openPresentation}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="admin-landing-error">
            {error}
            <button type="button" className="admin-landing-refresh" onClick={load}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}
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

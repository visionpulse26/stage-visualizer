import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'

// ΓöÇΓöÇ Embed Preview (Admin-only, V1) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// This route (/embed/:projectId) is protected by ProtectedRoute ΓÇö only
// authenticated admins can access it. Once embed-token API (P9) ships,
// ProtectedRoute will be removed and the route becomes public.
//
// The page renders what the embedded widget looks like: clean, no admin tools,
// restricted orbit only. Stage canvas will be wired in EmbedStageCanvas (P7).

export default function EmbedPage() {
  const { projectId } = useParams()
  const navigate      = useNavigate()

  const [project,  setProject]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    if (!projectId) { setError('No project ID in URL.'); setLoading(false); return }

    supabase
      .from('projects')
      .select('id, name, stage_url, camera_presets, scene_config, embed_enabled')
      .eq('id', projectId)
      .single()
      .then(({ data, error: dbErr }) => {
        if (dbErr || !data) {
          setError(dbErr?.message ?? 'Project not found.')
        } else {
          setProject(data)
        }
        setLoading(false)
      })
  }, [projectId])

  const baseUrl  = import.meta.env.VITE_APP_URL ?? window.location.origin
  const embedUrl = `${baseUrl}/embed/${projectId}`

  function copyEmbedCode() {
    const code = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500"\n  frameborder="0"\n  allow="fullscreen"\n  style="border-radius:8px"\n></iframe>`
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) return <BrandedLoadingScreen />

  if (error) {
    return (
      <div className="w-full h-full min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400/80 text-sm">{error}</p>
          <button
            onClick={() => navigate('/admin')}
            className="text-white/30 hover:text-white/60 text-xs underline transition-colors"
          >
            Back to Admin
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Admin header strip ΓÇö not shown in actual embed iframe */}
      <div className="h-9 bg-[#111] border-b border-white/5 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="text-white/25 hover:text-white/55 text-[10px] transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Admin
          </button>
          <span className="text-white/10 text-[10px]">/</span>
          <span className="text-white/30 text-[10px] font-mono truncate max-w-[200px]">
            {project?.name ?? projectId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!project?.embed_enabled && (
            <span className="text-amber-400/60 text-[10px] px-2 py-0.5 rounded bg-amber-400/5 border border-amber-400/15">
              Embed not enabled for this project
            </span>
          )}
          <span
            className="text-[10px] px-2 py-0.5 rounded border text-white/20 border-white/10"
            style={{ fontFamily: "'Chakra Petch', sans-serif", letterSpacing: '0.1em' }}
          >
            EMBED PREVIEW
          </span>
        </div>
      </div>

      {/* Embed frame area ΓÇö this is what will be rendered inside the iframe */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0">
        {/* Canvas placeholder ΓÇö replaced by EmbedStageCanvas in P7 */}
        <div className="flex-1 relative bg-[#0f0f0f] flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl border border-white/8 mx-auto flex items-center justify-center">
              <svg className="w-5 h-5 text-white/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"/>
              </svg>
            </div>
            <p className="text-white/20 text-xs">3D Stage Canvas (P7)</p>
            <p className="text-white/10 text-[10px] font-mono truncate max-w-[200px] mx-auto">
              {project?.stage_url ? 'Stage model loaded' : 'No stage model'}
            </p>
          </div>

          {/* Minimal overlay ΓÇö preset selector, branding */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
            <div className="flex gap-1.5 pointer-events-auto">
              {(project?.camera_presets ?? []).slice(0, 4).map((p, i) => (
                <button
                  key={i}
                  className="px-2.5 py-1 rounded bg-black/50 border border-white/10 text-white/40 text-[10px] backdrop-blur-sm"
                >
                  {p.name ?? `View ${i + 1}`}
                </button>
              ))}
            </div>
            <span
              className="text-white/15 text-[10px] tracking-widest"
              style={{ fontFamily: "'Chakra Petch', sans-serif" }}
            >
              TOOAWAKE
            </span>
          </div>
        </div>

        {/* Admin sidebar ΓÇö embed code + info; not part of the actual iframe */}
        <div className="w-full lg:w-72 bg-[#111] border-t lg:border-t-0 lg:border-l border-white/5 p-4 space-y-4 flex-shrink-0">
          <div className="space-y-1">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Project</p>
            <p className="text-white/70 text-sm font-medium truncate">{project?.name ?? 'Untitled'}</p>
            <p className="text-white/20 text-[10px] font-mono">{projectId}</p>
          </div>

          <div className="border-t border-white/5 pt-3 space-y-2">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Embed Code</p>
            <pre className="text-[9px] text-white/35 bg-black/30 border border-white/8 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
              {`<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500"\n  frameborder="0"\n  allow="fullscreen"\n></iframe>`}
            </pre>
            <button
              onClick={copyEmbedCode}
              className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/8 border border-white/10 text-white/40 hover:text-white/65 text-xs transition-all"
            >
              {copied ? 'Copied!' : 'Copy embed code'}
            </button>
          </div>

          {!project?.embed_enabled && (
            <div className="border-t border-white/5 pt-3">
              <p className="text-amber-400/50 text-[10px] leading-relaxed">
                Enable embed in Admin ΓåÆ Publish to make this project embeddable.
              </p>
            </div>
          )}

          <div className="border-t border-white/5 pt-3">
            <p className="text-[10px] text-white/15 leading-relaxed">
              This preview is admin-only. The embed widget will be publicly accessible once
              the embed-token API is deployed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useRef, useCallback, useEffect } from 'react'
import useHdriPresets from '../hooks/useHdriPresets'

// ── Tiny icon components ──────────────────────────────────────────────────────
const IconUpload    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4 4 4"/></svg>
const IconVideo     = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="7" width="15" height="10" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M17 9l5-3v12l-5-3V9z"/></svg>
const IconSun       = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
const IconCamera    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
const IconPlay      = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
const IconPause     = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zM14 5v14h4V5h-4z"/></svg>
const IconLoop      = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>
const IconTrash     = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
const IconLink      = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
const IconFolder    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
const IconCopy      = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
const IconGrid      = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
const IconGlobe     = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
const IconSparkle   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36-6.36-.7.7M6.34 17.66l-.7.7M17.66 17.66l-.7-.7M6.34 6.34l-.7-.7M12 8a4 4 0 100 8 4 4 0 000-8z"/></svg>
const IconEye       = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IconCloud     = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
const IconServer    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>

function Section({ icon, title, badge, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-white/40">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-white/50">{title}</span>
        {badge && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/30">{badge}</span>}
      </div>
      <div className="border-t border-white/5 pt-2">{children}</div>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, onChangeEnd }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-white/40">
        <span>{label}</span><span className="font-mono text-white/60">{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onMouseUp={e => onChangeEnd?.(Number(e.target.value))}
        onTouchEnd={e => onChangeEnd?.(Number(e.target.value))}
        className="w-full h-1 appearance-none rounded-full bg-white/10 accent-violet-400 cursor-pointer"
      />
    </div>
  )
}

// ── Main UIPanel ──────────────────────────────────────────────────────────────
function UIPanel({
  onModelUpload, onVideoUpload, onExternalVideoAdd,
  videoLoaded, ledMaterialFound,
  videoPlaylist, activeVideoId, onActivateVideo, onRenameClip, onClearPlaylist,
  isPlaying, isLooping, onPlay, onPause, onToggleLoop,
  // ── Virtual Camera (OBS / NDI) ──────────────────────────────────────────
  availableCameras, selectedCameraId, onCameraSelect,
  isCameraStreaming, onStartCameraStream, onStopCameraStream,
  sunAzimuth, onSunAzimuthChange, sunElevation, onSunElevationChange, sunIntensity, onSunIntensityChange,
  gridCellSize, onGridCellSizeChange,
  cameraPresets, onSaveView, onGoToView, onDeletePreset,
  onPublish, canPublish, isPublishing, publishStatus, publishError, publishedId,
  projectName, onProjectNameChange, onOpenDashboard,
  // ── Scene config (LITE & STABLE — no rotation) ──────────────────────────
  hdriPreset, onHdriPresetChange,
  hdriLoading,
  customHdriUrl,
  onCustomHdriUpload,
  // HDRI status flags
  hasLocalHdri, hasCloudHdri,
  isUploadingHdri, onUploadHdriToCloud, onClearHdri,
  onClearAllHdri,         // ★ NEW: Clear All HDRI button (aggressive cleanup)
  canUploadHdriToCloud,   // true only when hdriFile + publishedId both exist
  // ── NAS / External HDRI ─────────────────────────────────────────────────
  onNasUpload,            // (file) => upload video/image to NAS
  onNasHdriUpload,        // (file) => upload HDRI to NAS
  onExternalHdriUrl,      // (url)  => set external HDRI URL
  isNasUploading,
  nasError, onDismissNasError,
  envIntensity, onEnvIntensityChange,
  bgBlur, onBgBlurChange,
  showHdriBackground, onShowHdriBackgroundToggle,
  bloomStrength, onBloomStrengthChange,
  // ── Visual integrity ──────────────────────────────────────────────────────
  bloomThreshold, onBloomThresholdChange,
  protectLed, onProtectLedToggle,
}) {
  const modelInputRef      = useRef(null)
  const videoInputRef      = useRef(null)
  const hdriInputRef       = useRef(null)
  const nasVideoInputRef   = useRef(null)
  const nasHdriInputRef    = useRef(null)
  const [presetName,       setPresetName]       = useState('')
  const [copied,           setCopied]           = useState(null)
  const [activeSection,    setActiveSection]    = useState('media')
  const [editingClipId,    setEditingClipId]    = useState(null)
  const [editingName,      setEditingName]      = useState('')
  const renameInputRef     = useRef(null)

  // ── Video tab state ──────────────────────────────────────────────────────
  const [videoInputMode,   setVideoInputMode]   = useState('cloud')   // 'cloud' | 'link' | 'nas'
  const [externalUrlInput, setExternalUrlInput]  = useState('')

  // ── HDRI custom tab state ──────────────────────────────────────────────
  const [hdriInputMode,    setHdriInputMode]    = useState('cloud')   // 'cloud' | 'link' | 'nas'
  const [hdriDropdownOpen, setHdriDropdownOpen] = useState(false)

  // ── Fetch NAS HDRI presets ────────────────────────────────────────────────
  const { presets: nasHdriPresets, loading: presetsLoading } = useHdriPresets()
  const [externalHdriUrl,  setExternalHdriUrl]  = useState('')

  const handleCopy = useCallback((text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  const startRename = useCallback((clip) => {
    setEditingClipId(clip.id)
    setEditingName(clip.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }, [])

  const commitRename = useCallback(() => {
    if (editingClipId != null && editingName.trim()) {
      onRenameClip(editingClipId, editingName.trim())
    }
    setEditingClipId(null)
  }, [editingClipId, editingName, onRenameClip])

  const cancelRename = useCallback(() => { setEditingClipId(null) }, [])

  const handleAddExternal = useCallback(() => {
    const url = externalUrlInput.trim()
    if (!url) return
    onExternalVideoAdd(url, `External Clip ${videoPlaylist.length + 1}`)
    setExternalUrlInput('')
  }, [externalUrlInput, onExternalVideoAdd, videoPlaylist.length])

  const handleAddExternalHdri = useCallback(() => {
    const url = externalHdriUrl.trim()
    if (!url) return
    onExternalHdriUrl(url)
    setExternalHdriUrl('')
  }, [externalHdriUrl, onExternalHdriUrl])

  const handleNasVideoClick = useCallback(() => {
    if (!projectName?.trim()) {
      alert('Vui lòng đặt tên và Save Project trước khi up lên NAS!')
      return
    }
    nasVideoInputRef.current?.click()
  }, [projectName])

  const handleNasHdriClick = useCallback(() => {
    if (!projectName?.trim()) {
      alert('Vui lòng đặt tên và Save Project trước khi up lên NAS!')
      return
    }
    nasHdriInputRef.current?.click()
  }, [projectName])

  const sections = [
    { id: 'media',   label: 'Media',    icon: <IconVideo /> },
    { id: 'light',   label: 'Light',    icon: <IconSun /> },
    { id: 'camera',  label: 'Camera',   icon: <IconCamera /> },
    { id: 'publish', label: 'Publish',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7"/></svg> },
  ]

  const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2" style={{ width: 280 }}>
      {/* Section tabs */}
      <div className="flex gap-1 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-1">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
              activeSection === s.id
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/20'
                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
            }`}
          >
            {s.icon}
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Panel card */}
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin">

        {/* ── MEDIA ─────────────────────────────────────────────────────── */}
        {activeSection === 'media' && (
          <>
            <Section icon={<IconUpload />} title="Stage Model">
              <button
                onClick={() => modelInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 hover:border-violet-500/40 hover:bg-violet-500/5 text-white/40 hover:text-violet-300 text-xs font-medium transition-all"
              >
                <IconUpload /><span>Choose .glb / .gltf file</span>
              </button>
              <input ref={modelInputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={e => onModelUpload(e.target.files?.[0])} />
            </Section>

            <Section icon={<IconVideo />} title="Video Playlist" badge={videoPlaylist.length ? `${videoPlaylist.length} clips` : null}>
              {/* Video input mode tabs — 3 methods */}
              <div className="flex gap-0.5 mb-3 bg-white/5 border border-white/10 rounded-lg p-0.5">
                {[
                  { id: 'cloud', icon: <IconCloud />, label: 'Cloud' },
                  { id: 'link',  icon: <IconLink />,  label: 'Link'  },
                  { id: 'nas',   icon: <IconServer />, label: 'NAS'  },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setVideoInputMode(t.id)}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${
                      videoInputMode === t.id
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/20'
                        : 'text-white/35 hover:text-white/60'
                    }`}
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* Cloud (Supabase) — existing local-file upload */}
              {videoInputMode === 'cloud' && (
                <>
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 hover:border-violet-500/40 hover:bg-violet-500/5 text-white/40 hover:text-violet-300 text-xs font-medium transition-all"
                  >
                    <IconCloud /><span>Add Video / Image</span>
                  </button>
                  <input ref={videoInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={e => { onVideoUpload(e.target.files?.[0]); e.target.value = '' }} />
                  <p className="text-[9px] text-white/25 mt-1.5 leading-snug">Saved to Supabase when you Publish.</p>
                </>
              )}

              {/* Link — paste external URL */}
              {videoInputMode === 'link' && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    <input
                      type="url"
                      value={externalUrlInput}
                      onChange={e => setExternalUrlInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddExternal()}
                      placeholder="https://cdn.example.com/video.mp4"
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                    />
                    <button
                      onClick={handleAddExternal}
                      disabled={!externalUrlInput.trim()}
                      className="px-3 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 text-xs font-medium disabled:opacity-40 transition-all"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-400/60 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5 leading-snug">
                    URL must be CORS-enabled (Cloudinary, BunnyCDN, etc.).
                  </p>
                </div>
              )}

              {/* NAS — Too:Awake private server */}
              {videoInputMode === 'nas' && (
                <div className="space-y-2">
                  <button
                    onClick={handleNasVideoClick}
                    disabled={isNasUploading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-white/40 hover:text-emerald-300 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-wait"
                  >
                    {isNasUploading ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-emerald-300/30 border-t-emerald-300 animate-spin" />
                        Uploading to NAS…
                      </>
                    ) : (
                      <><IconServer /><span>Upload to Too:Awake NAS</span></>
                    )}
                  </button>
                  <input ref={nasVideoInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onNasUpload(f); e.target.value = '' }} />
                  {nasError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] font-semibold text-red-400">NAS Upload Failed</p>
                        <button onClick={onDismissNasError} className="text-red-400/50 hover:text-red-400 text-xs leading-none flex-shrink-0">✕</button>
                      </div>
                      <p className="text-[9px] text-red-400/70 leading-snug break-words">{nasError}</p>
                    </div>
                  )}
                  <p className="text-[9px] text-emerald-400/50 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-2.5 py-1.5 leading-snug">
                    Files are sent to your private NAS. Requires a saved project name.
                  </p>
                </div>
              )}

              {/* ── Virtual Camera (OBS / NDI) ─────────────────────────────── */}
              <div className="pt-2 border-t border-white/5 space-y-2">
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Virtual Camera</p>

                {/* Camera selector dropdown */}
                <select
                  value={selectedCameraId}
                  onChange={e => onCameraSelect(e.target.value)}
                  disabled={isCameraStreaming}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white/80 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="" className="bg-zinc-900">Select Camera...</option>
                  {availableCameras.map(cam => (
                    <option key={cam.deviceId} value={cam.deviceId} className="bg-zinc-900">
                      {cam.label || `Camera ${cam.deviceId.slice(0, 8)}...`}
                    </option>
                  ))}
                </select>

                {availableCameras.length === 0 && (
                  <p className="text-[9px] text-amber-400/60 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5 leading-snug">
                    No cameras detected. Start OBS Virtual Camera or NDI Webcam Input.
                  </p>
                )}

                {isCameraStreaming ? (
                  <div className="space-y-2">
                    {/* Live indicator */}
                    <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-500/15 border border-red-500/30">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                      </span>
                      <span className="text-red-400 text-xs font-semibold">Camera Live</span>
                    </div>
                    {/* Stop button */}
                    <button
                      onClick={onStopCameraStream}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-xs font-medium transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      Stop Camera
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onStartCameraStream}
                    disabled={!selectedCameraId}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-cyan-500/25 hover:border-cyan-500/50 hover:bg-cyan-500/5 text-white/40 hover:text-cyan-300 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-cyan-500/25 disabled:hover:bg-transparent disabled:hover:text-white/40"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Stream from Camera
                  </button>
                )}

                <p className="text-[9px] text-white/25 leading-snug">
                  Use OBS Virtual Camera or NDI to stream pure compositions.
                </p>
              </div>

              {/* Playlist — double-click name to rename */}
              {videoPlaylist.length > 0 && (
                <div className="mt-2 space-y-1">
                  {videoPlaylist.map(clip => (
                    <div key={clip.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                      clip.id === activeVideoId
                        ? 'bg-violet-500/15 border border-violet-500/25 text-white/90'
                        : 'bg-white/5 border border-transparent hover:bg-white/8 text-white/50 hover:text-white/70'
                    }`}>
                      {/* Type icon */}
                      <span className="flex-shrink-0 text-white/30">
                        {clip.type === 'image' ? (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                        )}
                      </span>

                      {/* Name — inline edit on double-click */}
                      {editingClipId === clip.id ? (
                        <input
                          ref={renameInputRef}
                          autoFocus
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename() }}
                          className="flex-1 min-w-0 bg-white/10 border border-violet-500/40 rounded px-1.5 py-0.5 text-xs text-white/90 outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => onActivateVideo(clip)}
                          onDoubleClick={(e) => { e.stopPropagation(); startRename(clip) }}
                          className="flex-1 min-w-0 text-left truncate cursor-pointer"
                          title="Double-click to rename"
                        >
                          {clip.name}
                        </button>
                      )}

                      {/* Badges */}
                      <span className="flex items-center gap-1 flex-shrink-0">
                        {clip.external && (
                          <span className="text-[8px] font-bold tracking-widest bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded px-1 py-0.5 uppercase">
                            Ext
                          </span>
                        )}
                        {clip.id === activeVideoId && (
                          <span className="text-[9px] text-violet-400 uppercase">Active</span>
                        )}
                      </span>

                      {/* Rename pencil button */}
                      {editingClipId !== clip.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(clip) }}
                          className="p-1 rounded hover:bg-white/10 text-white/20 hover:text-white/60 transition-all flex-shrink-0"
                          title="Rename"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={onClearPlaylist}
                    className="w-full py-1.5 mt-1 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 text-[11px] transition-all"
                  >
                    Clear Playlist
                  </button>
                </div>
              )}

              {/* Playback controls */}
              {videoLoaded && (
                <div className="flex gap-1 mt-2">
                  <button onClick={isPlaying ? onPause : onPlay}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs transition-all"
                  >
                    {isPlaying ? <IconPause /> : <IconPlay />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button onClick={onToggleLoop}
                    className={`px-3 rounded-lg border text-xs transition-all ${isLooping ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}
                  >
                    <IconLoop />
                  </button>
                </div>
              )}
            </Section>

            <Section icon={<IconGrid />} title="Grid Settings">
              <Slider label="Cell Size" value={gridCellSize} min={0.25} max={5} step={0.25} onChange={onGridCellSizeChange} />
            </Section>
          </>
        )}

        {/* ── LIGHT ─────────────────────────────────────────────────────── */}
        {activeSection === 'light' && (
          <div className="space-y-4">
            {/* Sun */}
            <Section icon={<IconSun />} title="Sun">
              <div className="space-y-3">
                <Slider label="Azimuth"   value={sunAzimuth}   min={0}   max={360} onChange={onSunAzimuthChange}   />
                <Slider label="Elevation" value={sunElevation} min={0}   max={90}  onChange={onSunElevationChange} />
                <Slider label="Intensity" value={sunIntensity} min={0}   max={5}   step={0.05} onChange={onSunIntensityChange} />
              </div>
            </Section>

            {/* HDRI Environment */}
            <Section icon={<IconGlobe />} title="Environment (HDRI)">
              <div className="space-y-3">
                {/* HDRI Preset Dropdown — locked during loading */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Environment</span>
                    {hdriLoading && (
                      <span className="flex items-center gap-1.5 text-[9px] text-[#ff5500]">
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-[#ff5500]/30 border-t-[#ff5500] animate-spin" />
                        Loading…
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => !hdriLoading && setHdriDropdownOpen(v => !v)}
                      disabled={hdriLoading}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border text-left text-xs transition-all ${
                        hdriLoading
                          ? 'border-[#ff5500]/30 text-white/40 cursor-wait'
                          : 'border-white/10 hover:border-[#ff5500]/40 text-white/70'
                      }`}
                    >
                      <span className="truncate">
                        {hdriLoading
                          ? 'Processing HDRI…'
                          : customHdriUrl
                            ? (customHdriUrl.startsWith('blob:') ? '🎨 Custom (Local)' : '🎨 Custom')
                            : nasHdriPresets.find(p => p.id === hdriPreset)?.label || hdriPreset || 'Off'
                        }
                      </span>
                      <svg className={`w-4 h-4 text-white/30 transition-transform ${hdriDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    {hdriDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-xl bg-black/95 border border-[#ff5500]/30 shadow-xl backdrop-blur-xl scrollbar-thin">
                        {presetsLoading ? (
                          <div className="flex items-center justify-center gap-2 py-4 text-white/40 text-xs">
                            <img src="https://visual.tooawake.online/logo_tooawake.png" alt="" className="h-4 animate-pulse" />
                            Loading HDRIs…
                          </div>
                        ) : (
                          <>
                            {nasHdriPresets.map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  if (p.url) {
                                    onExternalHdriUrl(p.url)
                                  } else {
                                    onHdriPresetChange(p.id)
                                    onClearHdri?.()
                                  }
                                  setHdriDropdownOpen(false)
                                }}
                                className={`w-full text-left px-3 py-2 text-[11px] transition-all border-b border-white/5 last:border-0 ${
                                  ((!customHdriUrl && hdriPreset === p.id) || (customHdriUrl && customHdriUrl === p.url))
                                    ? 'bg-[#ff5500]/20 text-[#ff5500]'
                                    : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                            {customHdriUrl && (
                              <button
                                onClick={() => setHdriDropdownOpen(false)}
                                className="w-full text-left px-3 py-2 text-[11px] bg-[#ff5500]/15 text-[#ff5500] border-t border-white/10"
                              >
                                🎨 {customHdriUrl.startsWith('blob:') ? 'Custom (Local File)' : 'Custom (External)'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Clear All HDRI — aggressive cleanup for GPU stability */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    onClick={onClearAllHdri}
                    disabled={hdriLoading || (!customHdriUrl && hdriPreset === 'none')}
                    className="w-full py-2 px-3 rounded text-xs font-semibold uppercase tracking-wider
                             bg-[#ff5500] hover:bg-[#ff6622] text-white
                             disabled:opacity-30 disabled:cursor-not-allowed
                             transition-all duration-200"
                  >
                    ⚡ Clear All HDRI
                  </button>
                  <p className="text-[9px] text-white/30 mt-1 text-center">
                    Releases GPU memory (RTX 4080 safe)
                  </p>
                </div>

                {/* Custom HDRI — 3 methods */}
                <div className="space-y-2">
                  <span className="text-[10px] text-white/40 uppercase tracking-widest">Custom HDRI</span>

                  {/* Method tabs */}
                  <div className="flex gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                    {[
                      { id: 'cloud', icon: <IconCloud />, label: 'Cloud' },
                      { id: 'link',  icon: <IconLink />,  label: 'Link'  },
                      { id: 'nas',   icon: <IconServer />, label: 'NAS'  },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setHdriInputMode(t.id)}
                        className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${
                          hdriInputMode === t.id
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/20'
                            : 'text-white/35 hover:text-white/60'
                        }`}
                      >
                        {t.icon}{t.label}
                      </button>
                    ))}
                  </div>

                  {/* Cloud — local blob preview + optional Supabase push */}
                  {hdriInputMode === 'cloud' && (
                    <div className="space-y-2">
                      <button
                        onClick={() => hdriInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-white/15 hover:border-violet-500/40 hover:bg-violet-500/5 text-white/40 hover:text-violet-300 text-xs font-medium transition-all"
                      >
                        <IconCloud />
                        <span>{hasLocalHdri || hasCloudHdri ? 'Replace .hdr / .exr' : 'Upload .hdr / .exr'}</span>
                      </button>
                      <input
                        ref={hdriInputRef}
                        type="file"
                        accept=".hdr,.exr"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) onCustomHdriUpload(f); e.target.value = '' }}
                      />
                    </div>
                  )}

                  {/* Link — paste external HDRI URL */}
                  {hdriInputMode === 'link' && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <input
                          type="url"
                          value={externalHdriUrl}
                          onChange={e => setExternalHdriUrl(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddExternalHdri()}
                          placeholder="https://example.com/env.hdr"
                          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white/80 placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                        />
                        <button
                          onClick={handleAddExternalHdri}
                          disabled={!externalHdriUrl.trim()}
                          className="px-3 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 text-xs font-medium disabled:opacity-40 transition-all"
                        >
                          Set
                        </button>
                      </div>
                      <p className="text-[9px] text-white/25 leading-snug">
                        Direct URL to a .hdr or .exr file. Must be CORS-enabled.
                      </p>
                    </div>
                  )}

                  {/* NAS — upload to Too:Awake server */}
                  {hdriInputMode === 'nas' && (
                    <div className="space-y-2">
                      <button
                        onClick={handleNasHdriClick}
                        disabled={isNasUploading}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-white/40 hover:text-emerald-300 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-wait"
                      >
                        {isNasUploading ? (
                          <>
                            <span className="w-4 h-4 rounded-full border-2 border-emerald-300/30 border-t-emerald-300 animate-spin" />
                            Uploading to NAS…
                          </>
                        ) : (
                          <><IconServer /><span>Upload .hdr / .exr to NAS</span></>
                        )}
                      </button>
                      <input ref={nasHdriInputRef} type="file" accept=".hdr,.exr" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onNasHdriUpload(f); e.target.value = '' }} />
                      {nasError && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[10px] font-semibold text-red-400">NAS Upload Failed</p>
                            <button onClick={onDismissNasError} className="text-red-400/50 hover:text-red-400 text-xs leading-none flex-shrink-0">✕</button>
                          </div>
                          <p className="text-[9px] text-red-400/70 leading-snug break-words">{nasError}</p>
                        </div>
                      )}
                      <p className="text-[9px] text-emerald-400/50 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-2.5 py-1.5 leading-snug">
                        HDRI sent to your private NAS. Requires a saved project name.
                      </p>
                    </div>
                  )}

                  {/* ── Local HDRI active — warning + Cloud upload ── */}
                  {hasLocalHdri && (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 space-y-2">
                      <p className="text-[10px] font-semibold text-amber-300 flex items-center gap-1.5">
                        <span>⚡</span> Local HDRI Active
                      </p>
                      <p className="text-[9px] text-amber-400/60 leading-snug">
                        Loaded from your RAM only. Not visible to others — disappears on refresh.
                      </p>
                      <div className="flex gap-1.5 pt-0.5">
                        <button
                          onClick={onUploadHdriToCloud}
                          disabled={isUploadingHdri || !canUploadHdriToCloud}
                          title={!canUploadHdriToCloud ? 'Publish the project first to enable cloud upload' : ''}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 text-[10px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          {isUploadingHdri ? (
                            <>
                              <span className="w-3 h-3 rounded-full border-2 border-violet-300/30 border-t-violet-300 animate-spin" />
                              Uploading…
                            </>
                          ) : '☁ Push to Supabase'}
                        </button>
                        <button
                          onClick={onClearHdri}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-white/40 hover:text-red-400 text-[10px] transition-all"
                        >
                          Clear
                        </button>
                      </div>
                      {!canUploadHdriToCloud && (
                        <p className="text-[9px] text-amber-400/40">
                          Publish the project first to enable cloud upload.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Cloud / NAS HDRI active ── */}
                  {hasCloudHdri && (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2.5">
                      <div>
                        <p className="text-[10px] font-semibold text-emerald-300">☁ Remote HDRI Active</p>
                        <p className="text-[9px] text-emerald-400/50 mt-0.5">Saved — visible to all clients.</p>
                      </div>
                      <button
                        onClick={onClearHdri}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-white/30 hover:text-red-400 text-[9px] transition-all flex-shrink-0 ml-2"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <Slider label="Env Intensity" value={envIntensity ?? 1} min={0} max={3} step={0.05} onChange={onEnvIntensityChange} />

                {/* Show HDRI Background toggle */}
                <div className="flex items-center justify-between pt-0.5">
                  <div>
                    <p className="text-[10px] text-white/40">Show HDRI Background</p>
                    <p className="text-[9px] text-white/20 mt-0.5">
                      {showHdriBackground ? 'Visible — HDRI shown as backdrop' : 'Stealth — black bg, HDRI lights only'}
                    </p>
                  </div>
                  <button
                    onClick={onShowHdriBackgroundToggle}
                    className={`relative w-9 h-5 rounded-full border transition-all flex-shrink-0 ml-2 ${
                      showHdriBackground
                        ? 'bg-violet-500/30 border-violet-500/50'
                        : 'bg-white/5 border-white/15'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                      showHdriBackground ? 'left-[18px] bg-violet-400' : 'left-0.5 bg-white/30'
                    }`} />
                  </button>
                </div>

                {/* BG Blur — only relevant when background is visible */}
                {showHdriBackground && (
                  <Slider label="BG Blur" value={bgBlur ?? 0} min={0} max={1} step={0.01} onChange={onBgBlurChange} />
                )}
              </div>
            </Section>

            {/* Post-FX */}
            <Section icon={<IconSparkle />} title="Post-FX">
              <div className="space-y-3">
                <Slider label="Bloom Strength" value={bloomStrength ?? 0.3} min={0} max={3} step={0.05} onChange={onBloomStrengthChange} />
                <p className="text-[9px] text-white/25 leading-snug">Bloom makes emissive LED materials radiate light. Higher values = stronger glow.</p>
              </div>
            </Section>

            {/* Visual Integrity */}
            <Section icon={<IconEye />} title="Visual Integrity">
              <div className="space-y-3">

                {/* Protect LED Colors toggle */}
                <button
                  onClick={onProtectLedToggle}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                    protectLed
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60 hover:bg-white/8'
                  }`}
                >
                  {/* Shield icon */}
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-semibold leading-tight">Protect LED Colors</p>
                    <p className="text-[9px] opacity-60 mt-0.5 leading-tight">
                      {protectLed ? 'ON — screens immune to env & tone mapping' : 'OFF — screens affected by environment'}
                    </p>
                  </div>
                  {/* Indicator dot */}
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${protectLed ? 'bg-emerald-400' : 'bg-white/20'}`} />
                </button>

                <Slider
                  label="Bloom Threshold"
                  value={bloomThreshold ?? 1.2}
                  min={0.0} max={2.0} step={0.05}
                  onChange={onBloomThresholdChange}
                />
                <p className="text-[9px] text-white/25 leading-snug">
                  Raise Bloom Threshold to reduce glow intensity. Protect LED Colors keeps screen content pixel-perfect.
                </p>
              </div>
            </Section>
          </div>
        )}

        {/* ── CAMERA ────────────────────────────────────────────────────── */}
        {activeSection === 'camera' && (
          <Section icon={<IconCamera />} title="Camera Presets">
            <div className="flex gap-1 mb-2">
              <input
                type="text"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && presetName.trim()) { onSaveView(presetName.trim()); setPresetName('') } }}
                placeholder="Preset name…"
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-violet-500/40"
              />
              <button
                onClick={() => { if (presetName.trim()) { onSaveView(presetName.trim()); setPresetName('') } }}
                className="px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 text-xs font-medium transition-all"
              >
                Save
              </button>
            </div>
            {cameraPresets.length === 0 ? (
              <p className="text-center text-white/20 text-[11px] py-3">No presets yet. Position the camera, then save a view.</p>
            ) : (
              <div className="space-y-1">
                {cameraPresets.map(p => (
                  <div key={p.id} className="flex items-center gap-1">
                    <button
                      onClick={() => onGoToView(p)}
                      className="flex-1 text-left px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-violet-500/10 border border-white/10 hover:border-violet-500/20 text-white/60 hover:text-white/90 text-xs transition-all truncate"
                    >
                      {p.name}
                    </button>
                    <button onClick={() => onDeletePreset(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-white/25 hover:text-red-400 transition-all">
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── PUBLISH ───────────────────────────────────────────────────── */}
        {activeSection === 'publish' && (
          <Section icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7"/></svg>} title="Publish Project">
            <div className="space-y-3">
              {/* Dashboard Button */}
              <button
                onClick={onOpenDashboard}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-white/50 hover:text-white/80 text-xs font-medium transition-all"
              >
                <IconFolder />
                <span>🗂️ Manage Published Projects</span>
              </button>

              {/* Project Name (new projects only) */}
              {!publishedId && (
                <div className="space-y-1">
                  <label className="text-[10px] text-white/35 uppercase tracking-widest">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={e => onProjectNameChange(e.target.value)}
                    placeholder="My Awesome Stage…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                  />
                </div>
              )}

              {/* Publish button */}
              <button
                onClick={() => onPublish({ videoInputMode, externalVideoUrl: externalUrlInput })}
                disabled={!canPublish || isPublishing}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                  canPublish && !isPublishing
                    ? 'bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
                }`}
              >
                {isPublishing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Publishing…
                  </span>
                ) : publishedId ? '🔄 Re-Publish' : '🚀 TAO VẪN BỊ KHÙNG ĐỂ DÙNG'}
              </button>

              {/* Status messages */}
              {publishStatus === 'success' && (
                <div className="space-y-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <p className="text-emerald-400 text-xs font-semibold">✓ Published successfully!</p>
                  <p className="text-white/40 text-[10px] font-mono break-all">ID: {publishedId}</p>

                  <div className="space-y-1.5 mt-2">
                    {[
                      { label: 'Collab Link', path: `/collab/${publishedId}` },
                      { label: 'View Link',   path: `/view/${publishedId}` },
                    ].map(({ label, path }) => (
                      <div key={path} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/30 w-16 flex-shrink-0">{label}</span>
                        <button
                          onClick={() => handleCopy(`${baseUrl}${path}`, label)}
                          className="flex-1 flex items-center justify-between gap-1 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-white/50 hover:text-white/70 font-mono transition-all truncate"
                        >
                          <span className="truncate">{path}</span>
                          {copied === label ? <span className="text-emerald-400 flex-shrink-0 text-[9px]">Copied!</span> : <IconCopy />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {publishStatus === 'error' && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1">
                  <p className="text-red-400 text-xs font-semibold">✗ Publish failed</p>
                  {publishError && <p className="text-red-400/60 text-[10px]">{publishError}</p>}
                </div>
              )}

              {!canPublish && (
                <p className="text-center text-white/20 text-[11px]">Upload a .glb stage model first to enable publishing.</p>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

export default UIPanel

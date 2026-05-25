import { useState, useRef, useCallback } from 'react'
import useHdriPresets from '../hooks/useHdriPresets'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconUpload  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4 4 4"/></svg>
const IconVideo   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="7" width="15" height="10" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M17 9l5-3v12l-5-3V9z"/></svg>
const IconSun     = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
const IconCamera  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
const IconPlay    = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
const IconPause   = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zM14 5v14h4V5h-4z"/></svg>
const IconLoop    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>
const IconGlobe   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
const IconSparkle = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36-6.36-.7.7M6.34 17.66l-.7.7M17.66 17.66l-.7-.7M6.34 6.34l-.7-.7M12 8a4 4 0 100 8 4 4 0 000-8z"/></svg>
const IconEye     = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IconShot    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>

// ── Shared primitives ─────────────────────────────────────────────────────────
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
        <span>{label}</span>
        <span className="font-mono text-white/60">{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onMouseUp={e => onChangeEnd?.(Number(e.target.value))}
        onTouchEnd={e => onChangeEnd?.(Number(e.target.value))}
        className="w-full h-1 appearance-none rounded-full bg-white/10 accent-cyan-400 cursor-pointer"
      />
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ label, hint, active, onToggle }) {
  return (
    <div className="flex items-center justify-between pt-0.5">
      <div>
        <p className="text-[10px] text-white/40">{label}</p>
        {hint && <p className="text-[9px] text-white/20 mt-0.5">{hint}</p>}
      </div>
      <button
        onClick={onToggle}
        className={`relative w-9 h-5 rounded-full border transition-all flex-shrink-0 ml-2 ${
          active ? 'bg-cyan-500/30 border-cyan-500/50' : 'bg-white/5 border-white/15'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
          active ? 'left-[18px] bg-cyan-400' : 'left-0.5 bg-white/30'
        }`} />
      </button>
    </div>
  )
}

// ── CollabPanel ───────────────────────────────────────────────────────────────
function CollabPanel({
  // ── Media ──────────────────────────────────────────────────────────────────
  onVideoUpload,
  transcodeStatus,
  videoLoaded,
  videoPlaylist, activeVideoId, onActivateVideo, onClearPlaylist,
  isPlaying, isLooping, onPlay, onPause, onToggleLoop,
  // ── LOCAL Virtual Camera (OBS/NDI - local-only, no sync) ───────────────────
  availableCameras, selectedCameraId, onCameraSelect,
  isLocalCameraActive, onStartLocalCamera, onStopLocalCamera,
  // ── Lighting ───────────────────────────────────────────────────────────────
  sunAzimuth,   onSunAzimuthChange,
  sunElevation, onSunElevationChange,
  sunIntensity, onSunIntensityChange,
  // ── HDRI Environment (LITE & STABLE — no rotation) ─────────────────────────
  hdriPreset,        onHdriPresetChange,
  hdriLoading,
  customHdriUrl,
  onCustomHdriUpload,
  onClearAllHdri,    // ★ Clear All HDRI for GPU stability
  onSetHdriUrl,
  envIntensity,      onEnvIntensityChange,
  bgBlur,            onBgBlurChange,
  showHdriBackground, onShowHdriBackgroundToggle,
  // ── Post-FX ────────────────────────────────────────────────────────────────
  bloomStrength,  onBloomStrengthChange,
  bloomThreshold, onBloomThresholdChange,
  protectLed,     onProtectLedToggle,
  // ── Camera (read-only — view only, no add/delete) ──────────────────────────
  cameraPresets, onGoToView,
  isAutoplayActive, onToggleAutoplay,
  // ── Screenshot ─────────────────────────────────────────────────────────────
  onScreenshot,
  // ── POV (Epic 1) ───────────────────────────────────────────────────────────
  povMode,
  onPovToggle,
  showPovControl,
}) {
  const [isVisible, setIsVisible] = useState(true)
  const [activeSection, setActiveSection] = useState('media')
  const [hdriDropdownOpen, setHdriDropdownOpen] = useState(false)
  const fileInputRef = useRef(null)
  const hdriInputRef = useRef(null)

  const { presets: nasHdriPresets, loading: presetsLoading } = useHdriPresets()

  const handleHdriFile = useCallback((file) => {
    if (file) onCustomHdriUpload(file)
  }, [onCustomHdriUpload])

  const handleSelectPreset = useCallback((preset) => {
    if (preset.url) {
      onSetHdriUrl(preset.url)
    } else {
      onHdriPresetChange(preset.id)
      onSetHdriUrl(null)
    }
    setHdriDropdownOpen(false)
  }, [onHdriPresetChange, onSetHdriUrl])

  // ALL HOOKS MUST BE DECLARED ABOVE ANY EARLY RETURN.
  // Previously `blockFriction` lived below `if (povMode) return null`, which
  // dropped the hook count when entering POV → React threw "Rendered fewer
  // hooks than expected" → entire tree crashed → white screen on Collab.
  const blockFriction = useCallback((e) => { e.preventDefault() }, [])

  const sections = [
    { id: 'media',  label: 'Media',  icon: <IconVideo />  },
    { id: 'light',  label: 'Light',  icon: <IconSun />    },
    { id: 'camera', label: 'Camera', icon: <IconCamera /> },
  ]

  // P4 — immersive POV: hide sandbox UI until Exit POV (use fixed button + hotkeys)
  if (povMode) return null

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="absolute top-4 left-4 z-10 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-black/70 transition-all"
        title="Show Menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    )
  }

  return (
    <div
      className="absolute top-4 left-4 z-10 flex flex-col gap-2"
      style={{ width: 280 }}
      onContextMenu={blockFriction}
      onDragStart={blockFriction}
    >

      {/* ── Sandbox Mode badge + minimize ───────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/20">
        <span className="text-amber-400 text-xs leading-none flex-shrink-0">⚡</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-amber-300/80 uppercase tracking-widest leading-tight">Sandbox Mode</p>
          <p className="text-[9px] text-amber-400/40 leading-tight mt-0.5 truncate">Changes are temporary — nothing is saved</p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
          title="Minimize Menu"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-1">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
              activeSection === s.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20'
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
            {/* No Stage Upload — Collab cannot modify the master 3D asset */}
            <Section
              icon={<IconVideo />}
              title="Video Playlist"
              badge={videoPlaylist.length ? `${videoPlaylist.length} clips` : null}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!!transcodeStatus}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 hover:border-cyan-500/40 hover:bg-cyan-500/5 text-white/40 hover:text-cyan-300 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-wait"
              >
                <IconUpload /><span>Add Video or Image</span>
              </button>
              {transcodeStatus && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <span className="w-3 h-3 rounded-full border-2 border-cyan-300/30 border-t-cyan-300 animate-spin flex-shrink-0" />
                  <span className="text-[10px] text-cyan-300">{transcodeStatus}</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.webm,.mov,.mkv,.avi,.hevc,.m4v,.ts,.wmv,.flv,.webp,.png,.jpg,.jpeg,.gif"
                className="hidden"
                onChange={e => { onVideoUpload(e.target.files?.[0]); e.target.value = '' }}
              />
              <p className="text-[10px] text-white/25 text-center mt-1.5 leading-snug">
                Local only — files disappear when you close this tab.
              </p>

              {videoPlaylist.length > 0 && (
                <div className="mt-2 space-y-1">
                  {videoPlaylist.map(clip => (
                    <button
                      key={clip.id}
                      onClick={() => onActivateVideo(clip)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all ${
                        clip.id === activeVideoId
                          ? 'bg-cyan-500/15 border border-cyan-500/25 text-white/90'
                          : 'bg-white/5 border border-transparent hover:bg-white/8 text-white/50 hover:text-white/70'
                      }`}
                    >
                      <span className="flex-1 truncate">{clip.name}</span>
                      <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                        {clip.file && (
                          <span className="text-[8px] font-bold tracking-widest bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded px-1 py-0.5 uppercase">
                            Local
                          </span>
                        )}
                        {clip.id === activeVideoId && (
                          <span className="text-[9px] text-cyan-400 uppercase">Active</span>
                        )}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={onClearPlaylist}
                    className="w-full py-1.5 mt-1 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 text-[11px] transition-all"
                  >
                    Clear Playlist
                  </button>
                </div>
              )}

              {videoLoaded && !isLocalCameraActive && (
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={isPlaying ? onPause : onPlay}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs transition-all"
                  >
                    {isPlaying ? <IconPause /> : <IconPlay />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    onClick={onToggleLoop}
                    className={`px-3 rounded-lg border text-xs transition-all ${
                      isLooping
                        ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'
                    }`}
                  >
                    <IconLoop />
                  </button>
                </div>
              )}
            </Section>

            {/* ── LOCAL Virtual Camera (OBS/NDI) ─────────────────────────── */}
            <Section icon={<IconCamera />} title="Local Preview" badge="Your Screen Only">
              <p className="text-[10px] text-white/30 mb-2">
                Stream from OBS Virtual Camera or NDI. <span className="text-amber-400">Only you</span> will see this — it won't affect others.
              </p>

              {/* Camera selector */}
              {availableCameras && availableCameras.length > 0 ? (
                <select
                  value={selectedCameraId}
                  onChange={e => onCameraSelect(e.target.value)}
                  disabled={isLocalCameraActive}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select Camera...</option>
                  {availableCameras.map(cam => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${cam.deviceId.slice(0, 8)}...`}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-white/20 text-center py-2">No cameras detected</p>
              )}

              {/* Stream controls */}
              <div className="mt-2">
                {isLocalCameraActive ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-[11px] text-cyan-300 font-medium">Local Preview Active</span>
                    </div>
                    <button
                      onClick={onStopLocalCamera}
                      className="w-full py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-medium transition-all"
                    >
                      Stop Local Camera
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onStartLocalCamera}
                    disabled={!selectedCameraId}
                    className="w-full py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Start Local Stream
                  </button>
                )}
              </div>

              <p className="text-[9px] text-amber-400/50 text-center mt-2">
                Use OBS Virtual Camera or NDI to preview compositions locally.
              </p>
            </Section>

            {showPovControl && (
              <div className="pt-1 border-t border-white/5">
                <button
                  type="button"
                  onClick={onPovToggle}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                    povMode
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
                  }`}
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  {povMode ? 'Exit audience POV' : 'Audience POV'}
                </button>
              </div>
            )}

            {/* Screenshot */}
            <div className="pt-1 border-t border-white/5">
              <button
                onClick={onScreenshot}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-white/40 hover:text-white/70 text-xs font-medium transition-all"
              >
                <IconShot /><span>Screenshot</span>
              </button>
            </div>
          </>
        )}

        {/* ── LIGHT — full match with Admin UIPanel ────────────────────── */}
        {activeSection === 'light' && (
          <div className="space-y-4">

            {/* Sun */}
            <Section icon={<IconSun />} title="Sun">
              <div className="space-y-3">
                <Slider label="Azimuth"   value={sunAzimuth}   min={0}   max={360}  onChange={onSunAzimuthChange}   />
                <Slider label="Elevation" value={sunElevation} min={0}   max={90}   onChange={onSunElevationChange} />
                <Slider label="Intensity" value={sunIntensity} min={0}   max={5}    step={0.05} onChange={onSunIntensityChange} />
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
                            <img src="https://visual.tooawake.mov/logo_tooawake.png" alt="" className="h-4 animate-pulse" />
                            Loading HDRIs…
                          </div>
                        ) : (
                          <>
                            {nasHdriPresets.map(p => (
                              <button
                                key={p.id}
                                onClick={() => handleSelectPreset(p)}
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

                {/* Clear All HDRI — aggressive cleanup */}
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
                </div>

                {/* Custom HDRI Upload — local preview only, sandbox session */}
                <div className="pt-1 border-t border-white/5">
                  <button
                    onClick={() => hdriInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-white/15 hover:border-cyan-500/40 hover:bg-cyan-500/5 text-white/40 hover:text-cyan-300 text-xs font-medium transition-all"
                  >
                    <IconUpload /><span>Upload Custom .hdr / .exr</span>
                  </button>
                  <input
                    ref={hdriInputRef}
                    type="file"
                    accept=".hdr,.exr"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleHdriFile(f); e.target.value = '' }}
                  />
                  <p className="text-[9px] text-amber-400/50 mt-1.5 leading-snug">
                    ⚡ Local preview only — resets when you close this tab.
                  </p>
                </div>

                <Slider label="Env Intensity" value={envIntensity ?? 1} min={0} max={3} step={0.05} onChange={onEnvIntensityChange} />

                <Toggle
                  label="Show HDRI Background"
                  hint={showHdriBackground ? 'Visible — HDRI shown as backdrop' : 'Stealth — black bg, HDRI lights only'}
                  active={showHdriBackground}
                  onToggle={onShowHdriBackgroundToggle}
                />

                {showHdriBackground && (
                  <Slider label="BG Blur" value={bgBlur ?? 0} min={0} max={1} step={0.01} onChange={onBgBlurChange} />
                )}
              </div>
            </Section>

            {/* Post-FX */}
            <Section icon={<IconSparkle />} title="Post-FX">
              <div className="space-y-3">
                <Slider label="Bloom Strength" value={bloomStrength ?? 0.3} min={0} max={3} step={0.05} onChange={onBloomStrengthChange} />
                <p className="text-[9px] text-white/25 leading-snug">
                  Bloom makes emissive LED materials radiate light. Higher = stronger glow.
                </p>
              </div>
            </Section>

            {/* Visual Integrity */}
            <Section icon={<IconEye />} title="Visual Integrity">
              <div className="space-y-3">
                <button
                  onClick={onProtectLedToggle}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                    protectLed
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60 hover:bg-white/8'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-semibold leading-tight">Protect LED Colors</p>
                    <p className="text-[9px] opacity-60 mt-0.5 leading-tight">
                      {protectLed ? 'ON — screens immune to env & tone mapping' : 'OFF — screens affected by environment'}
                    </p>
                  </div>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${protectLed ? 'bg-emerald-400' : 'bg-white/20'}`} />
                </button>

                <Slider
                  label="Bloom Threshold"
                  value={bloomThreshold ?? 1.2}
                  min={0.0} max={2.0} step={0.05}
                  onChange={onBloomThresholdChange}
                />
                <p className="text-[9px] text-white/25 leading-snug">
                  Raise threshold to reduce glow. Protect LED Colors keeps screen content pixel-perfect.
                </p>
              </div>
            </Section>
          </div>
        )}

        {/* ── CAMERA — read-only (view presets, no add/delete) ─────────── */}
        {activeSection === 'camera' && (
          <Section icon={<IconCamera />} title="Camera Presets">
            {cameraPresets.length === 0 ? (
              <p className="text-center text-white/20 text-[11px] py-3">
                No camera presets saved yet. Ask the Admin to save views from the Admin panel.
              </p>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => onToggleAutoplay?.()}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    isAutoplayActive
                      ? 'bg-[#FF5F1F] text-[#000000]'
                      : 'bg-white/5 hover:bg-white/15 border border-white/10 hover:border-cyan-500/30 text-white/70 hover:text-white'
                  }`}
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  {isAutoplayActive ? '⏸ STOP AUTOPLAY' : '▶ AUTOPLAY CAMERAS'}
                </button>
                <div className="space-y-1">
                {cameraPresets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onGoToView(p)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/20 text-white/60 hover:text-white/90 text-xs transition-all truncate"
                  >
                    {p.name}
                  </button>
                ))}
                </div>
              </div>
            )}
            <p className="text-[9px] text-white/20 mt-3 leading-snug">
              Collab view is read-only for camera presets. Use Free Camera to orbit manually.
            </p>
          </Section>
        )}

      </div>
    </div>
  )
}

export default CollabPanel

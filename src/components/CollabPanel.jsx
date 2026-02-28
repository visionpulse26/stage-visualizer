import { useRef } from 'react'

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconPlay   = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
const IconPause  = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zM14 5v14h4V5h-4z"/></svg>
const IconLoop   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>
const IconCamera = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
const IconSun    = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
const IconUpload = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4 4 4"/></svg>
const IconShot   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/><path strokeLinecap="round" d="M8 2l1 3M16 2l-1 3"/></svg>

function Slider({ label, value, min, max, step = 1, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-white/40">
        <span>{label}</span>
        <span className="font-mono text-white/60">{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none rounded-full bg-white/10 accent-cyan-400 cursor-pointer"
      />
    </div>
  )
}

function CollabPanel({
  onVideoUpload,
  videoLoaded, ledMaterialFound,
  videoPlaylist, activeVideoId, onActivateVideo, onClearPlaylist,
  isPlaying, isLooping, onPlay, onPause, onToggleLoop,
  sunAzimuth, onSunAzimuthChange, sunElevation, onSunElevationChange, sunIntensity, onSunIntensityChange,
  cameraPresets, onGoToView,
  onScreenshot,
}) {
  const fileInputRef = useRef(null)

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2" style={{ width: 260 }}>
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin">

        {/* ── Add Media ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-white/40"><IconUpload /></span>
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Add Media</span>
            <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 rounded font-semibold">LOCAL</span>
          </div>
          <div className="border-t border-white/5 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 hover:border-cyan-500/40 hover:bg-cyan-500/5 text-white/40 hover:text-cyan-300 text-xs font-medium transition-all"
            >
              <IconUpload /><span>+ Add Video or Image</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              className="hidden"
              onChange={e => { onVideoUpload(e.target.files?.[0]); e.target.value = '' }}
            />
            <p className="mt-2 text-[10px] text-white/25 text-center leading-snug">
              Files are loaded locally — not uploaded to any server.
            </p>
          </div>
        </div>

        {/* ── Playlist ──────────────────────────────────────────────────── */}
        {videoPlaylist.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Playlist</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/30">{videoPlaylist.length}</span>
            </div>
            <div className="border-t border-white/5 pt-2 space-y-1">
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
          </div>
        )}

        {/* ── Playback Controls ─────────────────────────────────────────── */}
        {videoLoaded && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Playback</span>
            </div>
            <div className="border-t border-white/5 pt-2 flex gap-1">
              <button
                onClick={isPlaying ? onPause : onPlay}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs transition-all"
              >
                {isPlaying ? <IconPause /> : <IconPlay />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={onToggleLoop}
                className={`px-3 rounded-lg border text-xs transition-all ${isLooping ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}
              >
                <IconLoop />
              </button>
            </div>
          </div>
        )}

        {/* ── Lighting ──────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-white/40"><IconSun /></span>
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Lighting</span>
          </div>
          <div className="border-t border-white/5 pt-2 space-y-3">
            <Slider label="Azimuth"   value={sunAzimuth}   min={0}   max={360} onChange={onSunAzimuthChange}   />
            <Slider label="Elevation" value={sunElevation} min={0}   max={90}  onChange={onSunElevationChange} />
            <Slider label="Intensity" value={sunIntensity} min={0}   max={5}   step={0.05} onChange={onSunIntensityChange} />
          </div>
        </div>

        {/* ── Camera Presets ────────────────────────────────────────────── */}
        {cameraPresets.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-white/40"><IconCamera /></span>
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Camera Views</span>
            </div>
            <div className="border-t border-white/5 pt-2 space-y-1">
              {cameraPresets.map(p => (
                <button
                  key={p.id}
                  onClick={() => onGoToView(p)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/20 text-white/55 hover:text-white/85 text-xs transition-all truncate"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Screenshot ───────────────────────────────────────────────── */}
        <div className="border-t border-white/5 pt-3">
          <button
            onClick={onScreenshot}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-white/40 hover:text-white/70 text-xs font-medium transition-all"
          >
            <IconShot /><span>Screenshot</span>
          </button>
        </div>

      </div>
    </div>
  )
}

export default CollabPanel

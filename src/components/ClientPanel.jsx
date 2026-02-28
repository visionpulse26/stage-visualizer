import { useState } from 'react'

/**
 * Minimal end-client panel.
 * Read-only playlist (switch clips, no add/clear), camera presets, play/pause.
 */
function ClientPanel({
  cameraPresets,
  onGoToView,
  videoPlaylist,
  activeVideoId,
  onActivateVideo,
  activeClip,
  isPlaying,
  onPlay,
  onPause,
  videoLoaded,
  onScreenshot,
}) {
  const [isVisible, setIsVisible] = useState(true)
  const activeIsVideo = activeClip?.type !== 'image'

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="absolute top-4 left-4 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-black/70 transition-all"
        title="Show Controls"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    )
  }

  return (
    <div className="absolute top-4 left-4 w-60 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">

      {/* Header */}
      <div className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-bold text-white tracking-widest uppercase">TOO:AWAKE Studio</p>
          <p className="text-[9px] text-blue-400/70 mt-0.5 uppercase tracking-wider">Client Presentation</p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1">

        {/* ── Read-only Media Playlist ── */}
        {videoPlaylist.length > 0 && (
          <div className="space-y-2">
            <CLabel>Video Playlist</CLabel>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {videoPlaylist.map((clip, i) => (
                <button
                  key={clip.id}
                  onClick={() => onActivateVideo(clip)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-2 ${
                    clip.id === activeVideoId
                      ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border border-white/5 hover:bg-white/10 text-white/55 hover:text-white/90'
                  }`}
                >
                  <span className="w-4 h-4 bg-white/10 rounded flex items-center justify-center text-[9px] text-white/40 flex-shrink-0">
                    {i + 1}
                  </span>
                  {clip.type === 'image' ? (
                    <svg className="w-3 h-3 flex-shrink-0 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 flex-shrink-0 text-white/40" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="truncate">{clip.name}</span>
                  {clip.id === activeVideoId && (
                    <span className="ml-auto text-[9px] text-blue-400 uppercase flex-shrink-0">▶</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Player controls (video clips only) ── */}
        {videoLoaded && activeClip && activeIsVideo && (
          <>
            {videoPlaylist.length > 0 && <Divider />}
            <div className="space-y-2">
              <CLabel>Player</CLabel>
              <div className="flex items-center gap-2">
                <button
                  onClick={onPlay}
                  disabled={isPlaying}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    isPlaying
                      ? 'bg-white/5 text-white/20 cursor-not-allowed'
                      : 'bg-white/15 hover:bg-white/25 text-white border border-white/10'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Play
                </button>
                <button
                  onClick={onPause}
                  disabled={!isPlaying}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    !isPlaying
                      ? 'bg-white/5 text-white/20 cursor-not-allowed'
                      : 'bg-white/15 hover:bg-white/25 text-white border border-white/10'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Pause
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Camera presets ── */}
        {cameraPresets.length > 0 && (
          <>
            <Divider />
            <div className="space-y-2">
              <CLabel>Camera Angles</CLabel>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {cameraPresets.map((preset, i) => (
                  <button
                    key={preset.id}
                    onClick={() => onGoToView(preset)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs bg-white/5 hover:bg-white/15 border border-white/5 hover:border-white/15 text-white/60 hover:text-white transition-all flex items-center gap-2"
                  >
                    <span className="w-4 h-4 bg-white/10 rounded-md flex items-center justify-center text-[9px] text-white/40 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <Divider />

        {/* ── Screenshot ── */}
        <button
          onClick={onScreenshot}
          className="w-full py-2 px-4 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-xl text-sm font-medium text-white/70 hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <span className="text-base leading-none">📸</span>
          Screenshot
        </button>

      </div>

      <div className="px-4 py-2.5 bg-black/20 border-t border-white/5 flex-shrink-0">
        <p className="text-[9px] text-white/15 text-center">Presentation view • Read-only</p>
      </div>
    </div>
  )
}

function Divider() { return <div className="border-t border-white/5" /> }

function CLabel({ children }) {
  return <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{children}</p>
}

export default ClientPanel

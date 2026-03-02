import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import CollabPanel from '../components/CollabPanel'
import TopBar from '../components/TopBar'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import { supabase } from '../lib/supabaseClient'

function CollabPage() {
  const { projectId } = useParams()

  const [modelUrl,        setModelUrl]        = useState(null)
  const [videoElement,    setVideoElement]    = useState(null)
  const [activeImageUrl,  setActiveImageUrl]  = useState(null)
  const [videoLoaded,     setVideoLoaded]     = useState(false)
  const [ledMaterialFound, setLedMaterialFound] = useState(false)
  const [isDbLoading,     setIsDbLoading]     = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)

  // ── Sun & Grid ───────────────────────────────────────────────────────────
  const [sunAzimuth,   setSunAzimuth]   = useState(45)
  const [sunElevation, setSunElevation] = useState(45)
  const [sunIntensity, setSunIntensity] = useState(1)
  const [gridCellSize, setGridCellSize] = useState(1)

  // ── Scene config (LITE & STABLE — no rotation) ──────────────────────────────
  const [hdriPreset,         setHdriPreset]         = useState('none')
  const [customHdriUrl,      setCustomHdriUrl]      = useState(null)
  const [hdriFileExt,        setHdriFileExt]        = useState('hdr')
  const [hdriLoading,        setHdriLoading]        = useState(false)
  const [envIntensity,       setEnvIntensity]       = useState(1)
  const [bgBlur,             setBgBlur]             = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength,      setBloomStrength]      = useState(0.3)
  const [bloomThreshold,     setBloomThreshold]     = useState(1.2)
  const [protectLed,         setProtectLed]         = useState(true)

  // ── Camera ───────────────────────────────────────────────────────────────
  const [cameraPresets, setCameraPresets] = useState([])
  const cameraControlsRef = useRef(null)

  // ── Media playlist ────────────────────────────────────────────────────────
  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [isLooping,     setIsLooping]     = useState(true)
  const videoRef     = useRef(null)
  const clipCountRef = useRef(0)
  const playlistRef  = useRef([])

  // ── Texture Crop — synced from Admin via Supabase Realtime ───────────────
  const [cropTop,    setCropTop]    = useState(0)
  const [cropBottom, setCropBottom] = useState(0)
  const [cropLeft,   setCropLeft]   = useState(0)
  const [cropRight,  setCropRight]  = useState(0)

  // Track blob URLs created locally so we can revoke them on unmount (memory safety)
  const localBlobUrlsRef = useRef([])

  useEffect(() => { playlistRef.current = videoPlaylist }, [videoPlaylist])

  // ── Cleanup on unmount — revoke only locally-created blob URLs ───────────
  useEffect(() => {
    return () => {
      localBlobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url) } catch (_) {} })
      // Also revoke any local HDRI blob
      if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
      }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Realtime: receive crop updates broadcast from Admin ──────────────────
  useEffect(() => {
    const channel = supabase
      .channel('screen-crop-sync', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'crop_update' }, ({ payload }) => {
        if (payload == null) return
        if (payload.cropTop    != null) setCropTop(payload.cropTop)
        if (payload.cropBottom != null) setCropBottom(payload.cropBottom)
        if (payload.cropLeft   != null) setCropLeft(payload.cropLeft)
        if (payload.cropRight  != null) setCropRight(payload.cropRight)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Video helpers ─────────────────────────────────────────────────────────
  const activateVideo = useCallback((id, url) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    const v = document.createElement('video')
    v.src = url; v.crossOrigin = 'anonymous'; v.loop = true
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      v.play().catch(console.error)
      videoRef.current = v
      setVideoElement(v); setVideoLoaded(true)
      setActiveVideoId(id); setIsPlaying(true); setIsLooping(true)
    })
    v.load()
  }, [])

  // ── Load project from Supabase ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function fetchProject() {
      setIsDbLoading(true)
      setProjectNotFound(false)

      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (cancelled) return

        if (error || !data) {
          setProjectNotFound(true)
          return
        }

        setModelUrl(data.stage_url)

        // Load full media playlist, or fall back to legacy single video_url
        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = data.media_playlist.map((item, i) => ({
            id:       Date.now() + i,
            name:     item.name,
            url:      item.url,
            type:     item.type,
            external: true,
          }))
          clipCountRef.current = restored.length
          setVideoPlaylist(restored)
          const first = restored[0]
          if (first.type === 'image') {
            setActiveImageUrl(first.url)
            setActiveVideoId(first.id)
            setVideoLoaded(true)
          } else {
            activateVideo(first.id, first.url)
          }
        } else if (data.video_url) {
          const id = Date.now()
          clipCountRef.current = 1
          setVideoPlaylist([{ id, name: 'Published Video', type: 'video', url: data.video_url }])
          activateVideo(id, data.video_url)
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)

        // Restore full scene_config — LITE & STABLE (no rotation)
        const cfg = data.scene_config
        if (cfg) {
          setHdriPreset(cfg.hdriPreset             ?? 'none')
          setEnvIntensity(cfg.envIntensity          ?? 1)
          setBgBlur(cfg.bgBlur                     ?? 0)
          setShowHdriBackground(cfg.showHdriBackground ?? false)
          setBloomStrength(cfg.bloomStrength        ?? 0.3)
          setBloomThreshold(cfg.bloomThreshold      ?? 1.2)
          setProtectLed(cfg.protectLed              ?? true)

          // HDRI URL
          if (cfg.customHdriUrl) {
            console.log('[CollabPage] Loading saved HDRI URL:', cfg.customHdriUrl)
            setCustomHdriUrl(cfg.customHdriUrl)
          } else {
            setCustomHdriUrl(null)
          }

          // ★ Sun lighting - load from Admin's saved config for consistency
          if (cfg.sunIntensity != null) setSunIntensity(cfg.sunIntensity)
          if (cfg.sunAzimuth != null)   setSunAzimuth(cfg.sunAzimuth)
          if (cfg.sunElevation != null) setSunElevation(cfg.sunElevation)
        }
      } catch (err) {
        console.error('Failed to load project:', err)
        if (!cancelled) setProjectNotFound(true)
      } finally {
        if (!cancelled) setIsDbLoading(false)
      }
    }

    fetchProject()
    return () => { cancelled = true }
  }, [projectId, activateVideo])

  // ── Handlers for locally-added media (blob URL only, never uploaded) ─────
  const handleVideoUpload = useCallback((file) => {
    if (!file) return
    clipCountRef.current += 1
    const url   = URL.createObjectURL(file)
    localBlobUrlsRef.current.push(url)
    const id    = Date.now()
    const isImg = file.type.startsWith('image/')
    const name  = isImg ? `Image ${clipCountRef.current}` : `Clip ${clipCountRef.current}`
    setVideoPlaylist(prev => [...prev, { id, name, url, type: isImg ? 'image' : 'video', file }])
    if (isImg) {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
      setVideoElement(null); setActiveImageUrl(url)
      setActiveVideoId(id); setVideoLoaded(true); setIsPlaying(false)
    } else {
      setActiveImageUrl(null); activateVideo(id, url)
    }
  }, [activateVideo])

  const handleActivateVideo = useCallback((clip) => {
    if (clip.type === 'image') {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
      setVideoElement(null); setActiveImageUrl(clip.url)
      setActiveVideoId(clip.id); setVideoLoaded(true); setIsPlaying(false)
    } else {
      setActiveImageUrl(null); activateVideo(clip.id, clip.url)
    }
  }, [activateVideo])

  const handleClearPlaylist = useCallback(() => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
    setVideoPlaylist(prev => {
      prev.forEach(c => {
        if (localBlobUrlsRef.current.includes(c.url)) {
          try { URL.revokeObjectURL(c.url) } catch (_) {}
        }
      })
      return []
    })
    setVideoElement(null); setActiveImageUrl(null)
    setVideoLoaded(false); setActiveVideoId(null); setIsPlaying(false)
    clipCountRef.current = 0
    localBlobUrlsRef.current = []
  }, [])

  const handlePlay       = useCallback(() => { videoRef.current?.play().catch(console.error); setIsPlaying(true)  }, [])
  const handlePause      = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])
  const handleToggleLoop = useCallback(() => {
    if (videoRef.current) { videoRef.current.loop = !videoRef.current.loop; setIsLooping(videoRef.current.loop) }
  }, [])

  // ── Custom HDRI — local preview only, blob URL ──
  const handleCustomHdriUpload = useCallback((file) => {
    if (!file) return
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    const ext = file.name.split('.').pop().toLowerCase() || 'hdr'
    const url = URL.createObjectURL(file)
    localBlobUrlsRef.current.push(url)
    setHdriFileExt(ext)
    setCustomHdriUrl(url)
    setHdriPreset('none')
  }, [customHdriUrl])

  // ── Set HDRI from NAS URL directly ──
  const handleSetHdriUrl = useCallback((url) => {
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(url)
    setHdriPreset('none')
  }, [customHdriUrl])

  // ★ CLEAR ALL HDRI — aggressive cleanup
  const handleClearAllHdri = useCallback(() => {
    console.log('[CollabPage] Clear All HDRI triggered')
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(null)
    setHdriPreset('none')
    setHdriLoading(false)
  }, [customHdriUrl])

  // Handle HDRI load errors — auto-clear
  const handleHdriLoadError = useCallback((errorMsg) => {
    console.warn('[CollabPage] HDRI load failed:', errorMsg)
    setHdriLoading(false)
  }, [])

  // ── Camera navigation (read-only) ────────────────────────────────────────
  const handleGoToView = useCallback((preset) => {
    cameraControlsRef.current?.setLookAt(
      preset.position.x, preset.position.y, preset.position.z,
      preset.target.x,   preset.target.y,   preset.target.z, true
    )
  }, [])

  // ── Screenshot ────────────────────────────────────────────────────────────
  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `Stage_Collab_${projectId}.png`
    a.href     = canvas.toDataURL('image/png')
    a.click()
  }, [projectId])

  // ── Sun position vector ───────────────────────────────────────────────────
  const sunPosition = useMemo(() => {
    const az = (sunAzimuth   * Math.PI) / 180
    const el = (sunElevation * Math.PI) / 180
    const d  = 15
    return [d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az)]
  }, [sunAzimuth, sunElevation])

  if (projectNotFound) {
    return <ProjectNotFound projectId={projectId} />
  }

  const sceneReady = !isDbLoading && !!modelUrl

  return (
    <div className="w-full h-full relative">
      <BrandedLoadingScreen isLoaded={sceneReady} />

      <StageCanvas
        modelUrl={modelUrl}
        videoElement={videoElement}
        activeImageUrl={activeImageUrl}
        onLedMaterialStatus={setLedMaterialFound}
        sunPosition={sunPosition}
        sunIntensity={sunIntensity}
        gridCellSize={gridCellSize}
        modelLoaded={!!modelUrl}
        cameraControlsRef={cameraControlsRef}
        hdriPreset={hdriPreset}
        customHdriUrl={customHdriUrl}
        hdriFileExt={hdriFileExt}
        onHdriLoading={setHdriLoading}
        onHdriLoadError={handleHdriLoadError}
        onHdriClearRequest={handleClearAllHdri}
        envIntensity={envIntensity}
        bgBlur={bgBlur}
        showHdriBackground={showHdriBackground}
        bloomStrength={bloomStrength}
        bloomThreshold={bloomThreshold}
        protectLed={protectLed}
        screenCrop={{ top: cropTop, bottom: cropBottom, left: cropLeft, right: cropRight }}
      >
        <CollabPanel
          // ── Media ────────────────────────────────────────────────────────
          onVideoUpload={handleVideoUpload}
          videoLoaded={videoLoaded}
          ledMaterialFound={ledMaterialFound}
          videoPlaylist={videoPlaylist}
          activeVideoId={activeVideoId}
          onActivateVideo={handleActivateVideo}
          onClearPlaylist={handleClearPlaylist}
          isPlaying={isPlaying}
          isLooping={isLooping}
          onPlay={handlePlay}
          onPause={handlePause}
          onToggleLoop={handleToggleLoop}
          // ── Lighting ─────────────────────────────────────────────────────
          sunAzimuth={sunAzimuth}       onSunAzimuthChange={setSunAzimuth}
          sunElevation={sunElevation}   onSunElevationChange={setSunElevation}
          sunIntensity={sunIntensity}   onSunIntensityChange={setSunIntensity}
          // ── HDRI ─────────────────────────────────────────────────────────
          hdriPreset={hdriPreset}              onHdriPresetChange={setHdriPreset}
          hdriLoading={hdriLoading}
          customHdriUrl={customHdriUrl}
          onCustomHdriUpload={handleCustomHdriUpload}
          onSetHdriUrl={handleSetHdriUrl}
          onClearAllHdri={handleClearAllHdri}
          envIntensity={envIntensity}          onEnvIntensityChange={setEnvIntensity}
          bgBlur={bgBlur}                      onBgBlurChange={setBgBlur}
          showHdriBackground={showHdriBackground}
          onShowHdriBackgroundToggle={() => setShowHdriBackground(v => !v)}
          // ── Post-FX & Visual Integrity ───────────────────────────────────
          bloomStrength={bloomStrength}        onBloomStrengthChange={setBloomStrength}
          bloomThreshold={bloomThreshold}      onBloomThresholdChange={setBloomThreshold}
          protectLed={protectLed}              onProtectLedToggle={() => setProtectLed(v => !v)}
          // ── Camera (read-only) ───────────────────────────────────────────
          cameraPresets={cameraPresets}
          onGoToView={handleGoToView}
          // ── Screenshot ───────────────────────────────────────────────────
          onScreenshot={handleScreenshot}
        />

        <TopBar role="Collaborator" color="cyan" />

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg px-5 py-2 text-white/40 text-xs pointer-events-none">
          Project: <span className="text-white/60 font-mono">{projectId}</span>
        </div>
      </StageCanvas>
    </div>
  )
}

// ── Overlays ──────────────────────────────────────────────────────────────────
function DbLoadingOverlay({ projectId }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 pointer-events-none">
      <div className="bg-black/80 border border-white/10 rounded-2xl px-8 py-6 flex flex-col items-center gap-4 max-w-sm text-center">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
        <div>
          <p className="text-white/90 text-sm font-semibold">Loading Project</p>
          <p className="text-white/40 text-xs mt-1">Fetching from cloud...</p>
          <p className="text-white/25 text-[10px] mt-2 font-mono">ID: {projectId}</p>
        </div>
      </div>
    </div>
  )
}

function ProjectNotFound({ projectId }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0c]">
      <div className="bg-black/60 border border-white/10 rounded-2xl px-10 py-8 flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl">
          🔍
        </div>
        <div>
          <p className="text-white/90 text-base font-semibold">Project Not Found</p>
          <p className="text-white/40 text-sm mt-1">No project with this ID exists in the database.</p>
          <p className="text-white/20 text-[11px] mt-2 font-mono break-all">{projectId}</p>
        </div>
        <div className="text-xs text-white/35 bg-white/5 border border-white/10 rounded-xl px-4 py-3 space-y-1">
          <p>Go to <span className="text-white/60">/admin</span>, upload a stage,</p>
          <p>then click <span className="text-emerald-400">🚀 Publish Project</span> to create a shareable link.</p>
        </div>
        <a
          href="/admin"
          className="px-5 py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-sm text-violet-300 transition-all"
        >
          Go to Admin →
        </a>
      </div>
    </div>
  )
}

export { DbLoadingOverlay }
export default CollabPage

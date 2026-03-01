import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import ClientPanel from '../components/ClientPanel'
import { RoleBadge } from './AdminPage'
import { DbLoadingOverlay } from './CollabPage'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import { supabase } from '../lib/supabaseClient'

function ClientPage() {
  const { projectId } = useParams()

  const [modelUrl,       setModelUrl]       = useState(null)
  const [videoElement,   setVideoElement]   = useState(null)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [videoLoaded,    setVideoLoaded]    = useState(false)
  const [isDbLoading,    setIsDbLoading]    = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)

  const [cameraPresets, setCameraPresets] = useState([])
  const cameraControlsRef = useRef(null)

  const [gridCellSize, setGridCellSize] = useState(1)

  // ── Scene config (LITE & STABLE — consistent with Admin settings) ───────────
  const [hdriPreset,         setHdriPreset]         = useState('none')
  const [customHdriUrl,      setCustomHdriUrl]      = useState(null)
  const [hdriLoading,        setHdriLoading]        = useState(false)
  const [envIntensity,       setEnvIntensity]       = useState(1)
  const [bgBlur,             setBgBlur]             = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength,      setBloomStrength]      = useState(0.3)
  const [bloomThreshold,     setBloomThreshold]     = useState(1.2)
  const [protectLed,         setProtectLed]         = useState(true)
  // ★ Sun lighting - loaded from scene_config for consistency
  const [sunPosition,        setSunPosition]        = useState([10.6, 10.6, 7.5])
  const [sunIntensity,       setSunIntensity]       = useState(1)

  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)

  const videoRef = useRef(null)

  // Cleanup video element on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    }
  }, [])

  // ── Shared video activation helper ───────────────────────────────────────
  const activateVideo = useCallback((id, url) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    const v = document.createElement('video')
    v.src = url; v.crossOrigin = 'anonymous'; v.loop = true
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      v.play().catch(console.error)
      videoRef.current = v
      setVideoElement(v)
      setVideoLoaded(true)
      setActiveVideoId(id)
      setIsPlaying(true)
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

        // Load stage model directly via its public HTTP URL
        setModelUrl(data.stage_url)

        // Load full media playlist, or fall back to legacy single video_url
        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = data.media_playlist.map((item, i) => ({
            id:   Date.now() + i,
            name: item.name,
            url:  item.url,
            type: item.type,
          }))
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
          setVideoPlaylist([{ id, name: 'Published Video', type: 'video', url: data.video_url }])
          activateVideo(id, data.video_url)
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)

        // Restore scene_config — consistent with Admin settings
        const cfg = data.scene_config
        console.log('[ClientPage] scene_config from DB:', JSON.stringify(cfg, null, 2))
        
        if (cfg) {
          // HDRI & Environment
          setHdriPreset(cfg.hdriPreset             ?? 'none')
          setEnvIntensity(cfg.envIntensity         ?? 1)
          setBgBlur(cfg.bgBlur                     ?? 0)
          setShowHdriBackground(cfg.showHdriBackground ?? false)
          
          // Post-FX
          setBloomStrength(cfg.bloomStrength       ?? 0.3)
          setBloomThreshold(cfg.bloomThreshold     ?? 1.2)
          setProtectLed(cfg.protectLed             ?? true)

          // ★ Sun lighting - load from Admin's saved config
          if (cfg.sunPosition && Array.isArray(cfg.sunPosition)) {
            setSunPosition(cfg.sunPosition)
          }
          if (cfg.sunIntensity != null) {
            setSunIntensity(cfg.sunIntensity)
          }

          // HDRI URL
          if (cfg.customHdriUrl) {
            setCustomHdriUrl(cfg.customHdriUrl)
          } else {
            setCustomHdriUrl(null)
          }
          
          console.log('[ClientPage] Loaded values - envIntensity:', cfg.envIntensity, 'sunIntensity:', cfg.sunIntensity)
        } else {
          console.warn('[ClientPage] No scene_config found in project data')
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

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleActivateVideo = useCallback((clip) => {
    if (clip.type === 'image') {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
      setVideoElement(null); setActiveImageUrl(clip.url)
      setActiveVideoId(clip.id); setVideoLoaded(true); setIsPlaying(false)
    } else {
      setActiveImageUrl(null); activateVideo(clip.id, clip.url)
    }
  }, [activateVideo])

  const handlePlay  = useCallback(() => { videoRef.current?.play().catch(console.error); setIsPlaying(true)  }, [])
  const handlePause = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `Stage_Client_${projectId}.png`; a.href = canvas.toDataURL('image/png'); a.click()
  }, [projectId])

  const handleGoToView = useCallback((preset) => {
    cameraControlsRef.current?.setLookAt(
      preset.position.x, preset.position.y, preset.position.z,
      preset.target.x,   preset.target.y,   preset.target.z, true
    )
  }, [])

  // Handle HDRI load errors — auto-clear silently for client
  const handleHdriLoadError = useCallback((errorMsg) => {
    console.warn('[ClientPage] HDRI load failed:', errorMsg)
    setHdriLoading(false)
  }, [])
  
  // ★ CLEAR ALL HDRI (called automatically on fatal error)
  const handleClearAllHdri = useCallback(() => {
    setCustomHdriUrl(null)
    setHdriPreset('none')
    setHdriLoading(false)
  }, [])

  if (projectNotFound) {
    return <ClientProjectNotFound projectId={projectId} />
  }

  const activeClip = videoPlaylist.find(c => c.id === activeVideoId)

  const sceneReady = !isDbLoading && !!modelUrl

  return (
    <div className="w-full h-full relative">
      <BrandedLoadingScreen isLoaded={sceneReady} />

      <StageCanvas
        modelUrl={modelUrl}
        videoElement={videoElement}
        activeImageUrl={activeImageUrl}
        onLedMaterialStatus={() => {}}
        sunPosition={sunPosition}
        sunIntensity={sunIntensity}
        gridCellSize={gridCellSize}
        modelLoaded={!!modelUrl}
        cameraControlsRef={cameraControlsRef}
        hdriPreset={hdriPreset}
        customHdriUrl={customHdriUrl}
        onHdriLoading={setHdriLoading}
        onHdriLoadError={handleHdriLoadError}
        onHdriClearRequest={handleClearAllHdri}
        envIntensity={envIntensity}
        bgBlur={bgBlur}
        showHdriBackground={showHdriBackground}
        bloomStrength={bloomStrength}
        bloomThreshold={bloomThreshold}
        protectLed={protectLed}
      >
        <ClientPanel
          cameraPresets={cameraPresets}
          onGoToView={handleGoToView}
          videoPlaylist={videoPlaylist}
          activeVideoId={activeVideoId}
          onActivateVideo={handleActivateVideo}
          activeClip={activeClip}
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onPause={handlePause}
          videoLoaded={videoLoaded}
          onScreenshot={handleScreenshot}
        />

        <RoleBadge role="Client View" color="blue" />
      </StageCanvas>
    </div>
  )
}

function ClientProjectNotFound({ projectId }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0c]">
      <div className="bg-black/60 border border-white/10 rounded-2xl px-10 py-8 flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">
          🔍
        </div>
        <div>
          <p className="text-white/90 text-base font-semibold">Presentation Not Available</p>
          <p className="text-white/40 text-sm mt-1">
            This link is either invalid or the project has not been published yet.
          </p>
          <p className="text-white/20 text-[11px] mt-2 font-mono break-all">{projectId}</p>
        </div>
        <p className="text-xs text-white/30">Please contact the person who shared this link.</p>
      </div>
    </div>
  )
}

export default ClientPage

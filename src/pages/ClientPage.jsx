import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import { useSecurityLockdown } from '../hooks/useSecurityLockdown'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
import ClientPanel from '../components/ClientPanel'
import Notch from '../components/Notch'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import GlobalFooter from '../components/GlobalFooter'
import { useStageLoading } from '../hooks/useStageLoading'
import { supabase } from '../lib/supabaseClient'
import { fetchAsBlobUrl } from '../utils/secureAssetLoader'
import { captureScreenshotWithWatermark } from '../utils/screenshotWithWatermark'

function ClientPage() {
  const { projectId } = useParams()
  useSecurityLockdown()
  const {
    loadingManager,
    progress,
    status,
    loaded: stageLoaded,
    reset: resetStageLoading,
  } = useStageLoading({
    onLoadComplete: () => {
      // Revoke GLB blob only — HDRI blob is revoked separately in onHdriLoadComplete
      // (HDRI may still be loading when GLB finishes; early revoke breaks HDRI load)
      if (modelBlobRef.current) { revokeBlob(modelBlobRef.current); modelBlobRef.current = null }
    },
  })

  const [modelUrl,       setModelUrl]       = useState(null)
  const [videoElement,   setVideoElement]   = useState(null)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [videoLoaded,    setVideoLoaded]    = useState(false)
  const [isDbLoading,    setIsDbLoading]    = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)
  const [projectName, setProjectName] = useState('LIVE STAGE')
  const [versionStatus, setVersionStatus] = useState('')

  const [cameraPresets, setCameraPresets] = useState([])
  const cameraControlsRef = useRef(null)
  const cameraTargetPresetRef = useRef(null)
  const [autoplayIntervalSeconds, setAutoplayIntervalSeconds] = useState(10)
  const [cameraFlyDurationSeconds, setCameraFlyDurationSeconds] = useState(4)
  const [isAutoplayActive, setIsAutoplayActive] = useState(false)
  const autoplayIntervalRef = useRef(null)

  const [gridCellSize, setGridCellSize] = useState(1)

  // ── Scene config (LITE & STABLE — consistent with Admin settings) ───────────
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
  // ★ Sun lighting - loaded from scene_config for consistency
  const [sunPosition,        setSunPosition]        = useState([10.6, 10.6, 7.5])
  const [sunIntensity,       setSunIntensity]       = useState(1)

  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)

  const videoRef = useRef(null)
  const modelBlobRef = useRef(null)
  const hdriBlobRef = useRef(null)

  const sceneReady = !isDbLoading && !!modelUrl && stageLoaded

  const revokeBlob = useCallback((url) => {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url) } catch (_) {}
    }
  }, [])

  useEffect(() => {
    return () => {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
      revokeBlob(modelBlobRef.current)
      revokeBlob(hdriBlobRef.current)
    }
  }, [revokeBlob])

  useEffect(() => {
    resetStageLoading()
  }, [projectId, resetStageLoading])

  // ── Shared video activation helper (revokes blob URL after load for IP protection) ──
  const activateVideo = useCallback((id, url) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    const v = document.createElement('video')
    v.src = url
    v.crossOrigin = 'anonymous'
    v.loop = true
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      revokeBlob(url)
      v.play().catch(() => {})
      videoRef.current = v
      setVideoElement(v)
      setVideoLoaded(true)
      setActiveVideoId(id)
      setIsPlaying(true)
    })
    v.load()
  }, [revokeBlob])

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

        const isRemote = (u) => u && (u.startsWith('http://') || u.startsWith('https://'))

        // Asset masking: fetch remote URLs as blobs to avoid exposing raw URLs
        const modelSrc = data.stage_url
        if (modelSrc && isRemote(modelSrc)) {
          try {
            const blobUrl = await fetchAsBlobUrl(modelSrc)
            modelBlobRef.current = blobUrl
            setModelUrl(blobUrl)
          } catch {
            setModelUrl(modelSrc)
          }
        } else {
          setModelUrl(modelSrc)
        }

        const loadMediaPlaylist = async (items) => {
          const restored = []
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            let url = item.url
            if (isRemote(url)) {
              try { url = await fetchAsBlobUrl(url) } catch {}
            }
            restored.push({ id: Date.now() + i, name: item.name, url, type: item.type })
          }
          return restored
        }

        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = await loadMediaPlaylist(data.media_playlist)
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
          let vidUrl = data.video_url
          if (isRemote(vidUrl)) {
            try { vidUrl = await fetchAsBlobUrl(vidUrl) } catch {}
          }
          const id = Date.now()
          setVideoPlaylist([{ id, name: 'Published Video', type: 'video', url: vidUrl }])
          activateVideo(id, vidUrl)
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)
        setProjectName(data.name || 'LIVE STAGE')

        // Restore scene_config — consistent with Admin settings
        const cfg = data.scene_config
        if (cfg) {
          setHdriPreset(cfg.hdriPreset             ?? 'none')
          setEnvIntensity(cfg.envIntensity         ?? 1)
          setBgBlur(cfg.bgBlur                     ?? 0)
          setShowHdriBackground(cfg.showHdriBackground ?? false)
          
          setBloomStrength(cfg.bloomStrength       ?? 0.3)
          setBloomThreshold(cfg.bloomThreshold     ?? 1.2)
          setProtectLed(cfg.protectLed             ?? true)

          if (cfg.sunPosition && Array.isArray(cfg.sunPosition)) {
            setSunPosition(cfg.sunPosition)
          }
          if (cfg.sunIntensity != null) {
            setSunIntensity(cfg.sunIntensity)
          }

          if (cfg.customHdriUrl) {
            const hdriSrc = cfg.customHdriUrl
            // Extract extension from the ORIGINAL URL before any blob conversion
            const rawExt = hdriSrc.split('.').pop()?.toLowerCase() || 'hdr'
            setHdriFileExt(['hdr', 'exr'].includes(rawExt) ? rawExt : 'hdr')
            if (isRemote(hdriSrc)) {
              try {
                const blobUrl = await fetchAsBlobUrl(hdriSrc)
                hdriBlobRef.current = blobUrl
                setCustomHdriUrl(blobUrl)
              } catch {
                setCustomHdriUrl(hdriSrc)
              }
            } else {
              setCustomHdriUrl(hdriSrc)
            }
          } else {
            setHdriFileExt('hdr')
            setCustomHdriUrl(null)
          }
          if (cfg.autoplayIntervalSeconds != null) {
            setAutoplayIntervalSeconds(cfg.autoplayIntervalSeconds)
          }
          if (cfg.cameraFlyDurationSeconds != null) {
            setCameraFlyDurationSeconds(cfg.cameraFlyDurationSeconds)
          }
          if (cfg.versionStatus != null) {
            setVersionStatus(cfg.versionStatus)
          }
        }
      } catch {
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

  const handlePlay  = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true)  }, [])
  const handlePause = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const dataUrl = captureScreenshotWithWatermark(canvas, projectName, versionStatus)
    const a = document.createElement('a')
    a.download = `Stage_Client_${projectId}.png`
    a.href = dataUrl
    a.click()
  }, [projectId, projectName, versionStatus])

  const handleGoToView = useCallback((preset) => {
    setCameraTargetPreset(cameraTargetPresetRef, preset)
  }, [])

  const handleToggleAutoplay = useCallback(() => {
    setIsAutoplayActive(prev => !prev)
  }, [])

  // Autoplay loop
  useEffect(() => {
    if (!isAutoplayActive || cameraPresets.length === 0) {
      if (autoplayIntervalRef.current) {
        clearInterval(autoplayIntervalRef.current)
        autoplayIntervalRef.current = null
      }
      return
    }
    let idx = 0
    const interval = autoplayIntervalSeconds * 1000
    const tick = () => {
      const preset = cameraPresets[idx % cameraPresets.length]
      if (preset) setCameraTargetPreset(cameraTargetPresetRef, preset)
      idx++
    }
    tick()
    autoplayIntervalRef.current = setInterval(tick, interval)
    return () => {
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)
    }
  }, [isAutoplayActive, cameraPresets, autoplayIntervalSeconds])

  // Interrupt on user control — run when stage is ready (controls exist)
  useEffect(() => {
    if (!sceneReady) return
    const controls = cameraControlsRef?.current
    if (!controls) return
    const onControlStart = () => {
      if (autoplayIntervalRef.current) {
        clearInterval(autoplayIntervalRef.current)
        autoplayIntervalRef.current = null
      }
      setIsAutoplayActive(false)
      cameraTargetPresetRef.current = null
    }
    controls.addEventListener?.('controlstart', onControlStart)
    return () => controls.removeEventListener?.('controlstart', onControlStart)
  }, [sceneReady])

  // Handle HDRI load errors — auto-clear silently for client
  const handleHdriLoadError = useCallback(() => {
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

  return (
    <div className="w-full h-full relative">
      <BrandedLoadingScreen
        isLoaded={sceneReady}
        progress={progress}
        status={status}
      />

      <StageCanvas
        modelUrl={modelUrl}
        loadingManager={modelUrl ? loadingManager : null}
        videoElement={videoElement}
        activeImageUrl={activeImageUrl}
        onLedMaterialStatus={() => {}}
        sunPosition={sunPosition}
        sunIntensity={sunIntensity}
        gridCellSize={gridCellSize}
        modelLoaded={!!modelUrl}
        cameraControlsRef={cameraControlsRef}
        cameraTargetPresetRef={cameraTargetPresetRef}
        cameraFlyDurationSeconds={cameraFlyDurationSeconds}
        hdriPreset={hdriPreset}
        customHdriUrl={customHdriUrl}
        hdriFileExt={hdriFileExt}
        onHdriLoading={setHdriLoading}
        onHdriLoadError={handleHdriLoadError}
        onHdriClearRequest={handleClearAllHdri}
        onHdriLoadComplete={() => { if (hdriBlobRef.current) { revokeBlob(hdriBlobRef.current); hdriBlobRef.current = null } }}
        onImageTextureLoaded={() => revokeBlob(activeImageUrl)}
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
          isAutoplayActive={isAutoplayActive}
          onToggleAutoplay={handleToggleAutoplay}
        />

        <Notch status={versionStatus} />
      </StageCanvas>

      <GlobalFooter projectName={projectName} />
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

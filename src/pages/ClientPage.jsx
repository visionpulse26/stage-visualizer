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
import { useBlobUrlCache } from '../hooks/useBlobUrlCache'
import { useProjectStats } from '../hooks/useProjectStats'
import { recordClientPageView, recordClientInteraction } from '../lib/analyticsTracker'
import { useClientSessionTracking } from '../hooks/useClientSessionTracking'
import { supabase } from '../lib/supabaseClient'
import { fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { captureScreenshotWithWatermark } from '../utils/screenshotWithWatermark'
import { isTouchDevice } from '../utils/isTouchDevice'
import { enterPovMode, captureOrbitState, restoreOrbitState } from '../utils/povCamera'

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
    // No blob revoke here — model blob is tracked by useBlobUrlCache, revoked on project change/unmount
  })

  const [modelUrl,       setModelUrl]       = useState(null)
  const [videoElement,   setVideoElement]   = useState(null)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [videoLoaded,    setVideoLoaded]    = useState(false)
  const [isDbLoading,    setIsDbLoading]    = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)
  const [clientLocked, setClientLocked] = useState(false)
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

  const [povHeightOffset, setPovHeightOffset] = useState(1.7)
  const [povMode, setPovMode] = useState(false)
  const [modelMetrics, setModelMetrics] = useState(null)
  const savedOrbitRef = useRef(null)
  const povModeRef = useRef(false)
  const povExitInProgressRef = useRef(false)
  useEffect(() => {
    povModeRef.current = povMode
  }, [povMode])

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
  const [transparentLedConfig, setTransparentLedConfig] = useState({
    enabled: true,
    gridDensity: 36,
    gridDensityX: 36,
    gridDensityY: 36,
    barThickness: 0.08,
    barThicknessX: 0.08,
    barThicknessY: 0.08,
    glow: 1.4,
    opacity: 0.95,
  })
  // ★ Sun lighting - loaded from scene_config for consistency
  const [sunPosition,        setSunPosition]        = useState([10.6, 10.6, 7.5])
  const [sunIntensity,       setSunIntensity]       = useState(1)

  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)

  const videoRef = useRef(null)
  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()
  useProjectStats(projectId, 'client') // presence for LIVE PULSE
  const { startClipWatch } = useClientSessionTracking(projectId)
  const currentCameraRef = useRef(null)

  const sceneReady = !isDbLoading && !!modelUrl && stageLoaded

  useEffect(() => {
    return () => {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    }
  }, [])

  useEffect(() => {
    resetStageLoading()
  }, [projectId, resetStageLoading])

  // ── Shared video activation helper — blob URLs kept in cache until project change/unmount ──
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
      // Do NOT revoke blob here — keeps URL valid when switching back to this clip
      v.play().catch(() => {})
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
      revokeAllBlobs()
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

        // Client link locking: if is_client_locked, block unauthenticated users
        if (data.is_client_locked) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            setClientLocked(true)
            setIsDbLoading(false)
            return
          }
        }
        setClientLocked(false)

        // Record view in client_page_views (no RPC; works with any project id type)
        recordClientPageView(projectId)

        const isRemote = (u) => u && (u.startsWith('http://') || u.startsWith('https://'))

        const modelSrc = data.stage_url
        setModelUrl(modelSrc || null)

        const loadMediaPlaylist = async (items) => {
          const restored = []
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            let url = item.url
            if (isRemote(url)) {
              try {
                const blobUrl = await fetchAsBlobUrlWithCache(url)
                addBlob(blobUrl)
                url = blobUrl
              } catch {}
            }
            restored.push({ id: Date.now() + i, name: item.name, url, type: item.type })
          }
          return restored
        }

        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = await loadMediaPlaylist(data.media_playlist)
          setVideoPlaylist(restored)
          const first = restored[0]
          startClipWatch?.(first?.name || 'Unknown')
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
            try {
              const blobUrl = await fetchAsBlobUrlWithCache(vidUrl)
              addBlob(blobUrl)
              vidUrl = blobUrl
            } catch {}
          }
          const id = Date.now()
          const name = 'Published Video'
          startClipWatch?.(name)
          setVideoPlaylist([{ id, name, type: 'video', url: vidUrl }])
          activateVideo(id, vidUrl)
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)
        setPovHeightOffset(typeof data.pov_height_offset === 'number' ? data.pov_height_offset : 1.7)
        setPovMode(false)
        povModeRef.current = false
        savedOrbitRef.current = null
        setProjectName(data.name || 'LIVE STAGE')
        setTransparentLedConfig({
          enabled: true,
          gridDensity: 36,
          gridDensityX: 36,
          gridDensityY: 36,
          barThickness: 0.08,
          barThicknessX: 0.08,
          barThicknessY: 0.08,
          glow: 1.4,
          opacity: 0.95,
        })

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
          setTransparentLedConfig(prev => ({
            ...prev,
            ...(cfg.transparentLedConfig || cfg.transparentLed || {}),
          }))

          if (cfg.sunPosition && Array.isArray(cfg.sunPosition)) {
            setSunPosition(cfg.sunPosition)
          }
          if (cfg.sunIntensity != null) {
            setSunIntensity(cfg.sunIntensity)
          }

          if (cfg.customHdriUrl) {
            const hdriSrc = cfg.customHdriUrl.replace('visual.tooawake.online', 'visual.tooawake.mov')
            const basePath = hdriSrc.split('?')[0] || hdriSrc
            const rawExt = basePath.split('.').pop()?.toLowerCase() || 'hdr'
            setHdriFileExt(['hdr', 'exr'].includes(rawExt) ? rawExt : 'hdr')
            // Obfuscation: fetch via blob so raw URL never reaches DOM/loaders
            if (isRemote(hdriSrc)) {
              fetchAsBlobUrlWithCache(hdriSrc).then((blobUrl) => {
                if (!cancelled) { addBlob(blobUrl); setCustomHdriUrl(blobUrl) }
              }).catch(() => { if (!cancelled) setCustomHdriUrl(hdriSrc) })
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
  }, [projectId, activateVideo, addBlob, revokeAllBlobs, startClipWatch])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleActivateVideo = useCallback((clip) => {
    recordClientInteraction(projectId, 'clip_play', clip?.name || 'Unknown')
    startClipWatch?.(clip?.name || 'Unknown')
    if (clip.type === 'image') {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
      setVideoElement(null); setActiveImageUrl(clip.url)
      setActiveVideoId(clip.id); setVideoLoaded(true); setIsPlaying(false)
    } else {
      setActiveImageUrl(null); activateVideo(clip.id, clip.url)
    }
  }, [activateVideo, projectId, startClipWatch])

  const handlePlay  = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true)  }, [])
  const handlePause = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    recordClientInteraction(projectId, 'screenshot', currentCameraRef.current || 'Default')
    const dataUrl = captureScreenshotWithWatermark(canvas, projectName, versionStatus)
    const a = document.createElement('a')
    a.download = `Stage_Client_${projectId}.png`
    a.href = dataUrl
    a.click()
  }, [projectId, projectName, versionStatus])

  const handleGoToView = useCallback((preset) => {
    setCameraTargetPreset(cameraTargetPresetRef, preset)
    recordClientInteraction(projectId, 'camera_change', preset?.name || 'Unknown')
    currentCameraRef.current = preset?.name || null
  }, [projectId])

  const handleToggleAutoplay = useCallback(() => {
    setIsAutoplayActive(prev => !prev)
  }, [])

  const exitPovMode = useCallback(async () => {
    if (!povModeRef.current || povExitInProgressRef.current) return
    povExitInProgressRef.current = true
    try {
      if (document.pointerLockElement) document.exitPointerLock()
      const ctrl = cameraControlsRef.current
      if (ctrl) {
        ctrl.connect()
        await restoreOrbitState(ctrl, savedOrbitRef.current)
      }
    } finally {
      povExitInProgressRef.current = false
      savedOrbitRef.current = null
      povModeRef.current = false
      setPovMode(false)
    }
  }, [])

  useEffect(() => {
    if (!povMode) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      void exitPovMode()
    }
    const opts = { capture: true }
    window.addEventListener('keydown', onKey, opts)
    window.addEventListener('keyup', onKey, opts)
    document.addEventListener('keydown', onKey, opts)
    document.addEventListener('keyup', onKey, opts)
    return () => {
      window.removeEventListener('keydown', onKey, opts)
      window.removeEventListener('keyup', onKey, opts)
      document.removeEventListener('keydown', onKey, opts)
      document.removeEventListener('keyup', onKey, opts)
    }
  }, [povMode, exitPovMode])

  const handlePovToggle = useCallback(async () => {
    const ctrl = cameraControlsRef.current
    if (!ctrl) return
    if (povMode) {
      await exitPovMode()
      return
    }
    if (!modelMetrics) return
    const snap = captureOrbitState(ctrl)
    if (!snap) return
    savedOrbitRef.current = snap
    await enterPovMode(ctrl, modelMetrics, povHeightOffset)
    ctrl.disconnect()
    povModeRef.current = true
    setPovMode(true)
  }, [povMode, exitPovMode, modelMetrics, povHeightOffset])

  useEffect(() => {
    if (!povMode) return
    if (autoplayIntervalRef.current) {
      clearInterval(autoplayIntervalRef.current)
      autoplayIntervalRef.current = null
    }
    setIsAutoplayActive(false)
    cameraTargetPresetRef.current = null
  }, [povMode])

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

  if (clientLocked) {
    return <ClientLinkLocked />
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
        onModelMetricsChange={setModelMetrics}
        povMode={povMode}
        povHeightOffset={povHeightOffset}
        onPovExitRequest={exitPovMode}
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
        transparentLedConfig={transparentLedConfig}
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
          povMode={povMode}
          onPovToggle={handlePovToggle}
          showPovControl={!isTouchDevice() && !!modelUrl && !!modelMetrics && sceneReady}
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

function ClientLinkLocked() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0c]">
      <div className="bg-black/60 border border-amber-500/20 rounded-2xl px-10 py-8 flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">
          🔒
        </div>
        <div>
          <p className="text-white/90 text-base font-semibold">Link Locked</p>
          <p className="text-white/40 text-sm mt-1">
            This presentation has been made private by the administrator. Access is restricted to authorized users only.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ClientPage

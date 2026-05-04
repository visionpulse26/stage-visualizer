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
import { clearMemCache, fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { captureScreenshotWithWatermark } from '../utils/screenshotWithWatermark'
import { isTouchDevice } from '../utils/isTouchDevice'
import { enterPovMode, captureOrbitState, restoreOrbitState } from '../utils/povCamera'

const isRemoteUrl = (url) => !!url && (url.startsWith('http://') || url.startsWith('https://'))

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
  const [clipTransition, setClipTransition] = useState({ active: false, name: '' })

  const videoRef = useRef(null)
  const activationSeqRef = useRef(0)
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
  const activateVideo = useCallback((id, url, activationSeq) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    setVideoLoaded(false)
    const v = document.createElement('video')
    v.src = url
    v.crossOrigin = 'anonymous'
    v.loop = true
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      if (activationSeq && activationSeq !== activationSeqRef.current) return
      // Do NOT revoke blob here — keeps URL valid when switching back to this clip
      v.play().catch(() => {})
      videoRef.current = v
      setVideoElement(v)
      setVideoLoaded(true)
      setActiveVideoId(id)
      setIsPlaying(true)
      setClipTransition({ active: false, name: '' })
    })
    v.addEventListener('error', () => {
      if (activationSeq && activationSeq !== activationSeqRef.current) return
      setVideoLoaded(false)
      setIsPlaying(false)
      setClipTransition({ active: false, name: '' })
    })
    v.load()
  }, [])

  const resolvePlayableUrl = useCallback(async (clip) => {
    if (!clip?.url || !isRemoteUrl(clip.url)) return clip?.url
    const blobUrl = await fetchAsBlobUrlWithCache(clip.url)
    addBlob(blobUrl)
    return blobUrl
  }, [addBlob])

  const activateClip = useCallback(async (clip, { track = true } = {}) => {
    if (!clip) return
    const activationSeq = ++activationSeqRef.current
    if (track) setClipTransition({ active: true, name: clip?.name || 'Next scene' })
    if (track) recordClientInteraction(projectId, 'clip_play', clip?.name || 'Unknown')
    startClipWatch?.(clip?.name || 'Unknown')
    setVideoLoaded(false)

    let url = clip.url
    try {
      url = await resolvePlayableUrl(clip)
    } catch {
      url = clip.url
    }
    if (activationSeq !== activationSeqRef.current) return

    if (clip.type === 'image') {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
      setVideoElement(null)
      setActiveImageUrl(url)
      setActiveVideoId(clip.id)
      setVideoLoaded(false)
      setIsPlaying(false)
    } else {
      setActiveImageUrl(null)
      activateVideo(clip.id, url, activationSeq)
    }
  }, [activateVideo, projectId, resolvePlayableUrl, startClipWatch])

  // ── Load project from Supabase ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function fetchProject() {
      activationSeqRef.current += 1
      revokeAllBlobs()
      clearMemCache()
      setIsDbLoading(true)
      setProjectNotFound(false)
      setVideoPlaylist([])
      setActiveVideoId(null)
      setActiveImageUrl(null)
      setVideoElement(null)
      setVideoLoaded(false)
      setClipTransition({ active: false, name: '' })

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

        const modelSrc = data.stage_url
        setModelUrl(modelSrc || null)

        const restoreMediaPlaylist = (items) => (items || []).map((item, i) => ({
          id: `${Date.now()}_${i}`,
          name: item.name,
          url: item.url,
          type: item.type,
        }))

        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = restoreMediaPlaylist(data.media_playlist)
          setVideoPlaylist(restored)
          const first = restored[0]
          activateClip(first, { track: false })
        } else if (data.video_url) {
          const id = Date.now()
          const name = 'Published Video'
          const clip = { id, name, type: 'video', url: data.video_url }
          setVideoPlaylist([clip])
          activateClip(clip, { track: false })
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)
        setPovHeightOffset(typeof data.pov_height_offset === 'number' ? data.pov_height_offset : 1.7)
        setPovMode(false)
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
  }, [projectId, activateClip, revokeAllBlobs])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleActivateVideo = useCallback((clip) => {
    activateClip(clip)
  }, [activateClip])

  const handlePlay  = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true)  }, [])
  const handlePause = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])

  const handleImageTextureLoaded = useCallback(() => {
    setVideoLoaded(true)
    setClipTransition({ active: false, name: '' })
  }, [])

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

  const handlePovToggle = useCallback(async () => {
    const ctrl = cameraControlsRef.current
    if (!ctrl) return
    if (povMode) {
      ctrl.connect()
      await restoreOrbitState(ctrl, savedOrbitRef.current)
      savedOrbitRef.current = null
      setPovMode(false)
      return
    }
    if (!modelMetrics) return
    const snap = captureOrbitState(ctrl)
    if (!snap) return
    savedOrbitRef.current = snap
    await enterPovMode(ctrl, modelMetrics, povHeightOffset)
    ctrl.disconnect()
    setPovMode(true)
  }, [povMode, modelMetrics, povHeightOffset])

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
        onImageTextureLoaded={handleImageTextureLoaded}
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

      <NextSceneLoadingPopup
        show={sceneReady && clipTransition.active}
        clipName={clipTransition.name}
      />

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

function NextSceneLoadingPopup({ show, clipName }) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center px-4">
      <div className="pointer-events-auto min-w-[260px] max-w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-white/12 bg-black/70 backdrop-blur-xl shadow-2xl px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="relative h-10 w-10 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border border-[#FF5F1F]/25" />
            <div className="absolute inset-1 rounded-full border-2 border-white/10 border-t-[#FF5F1F] animate-spin" />
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF5F1F]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF5F1F]">
              Loading next scene
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white/90">
              {clipName || 'Preparing visual'}
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 rounded-full bg-[#FF5F1F] animate-[scene-progress_1.15s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes scene-progress {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
    </div>
  )
}

export default ClientPage

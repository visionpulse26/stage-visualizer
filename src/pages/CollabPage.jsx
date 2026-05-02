import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import { useSecurityLockdown } from '../hooks/useSecurityLockdown'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
import CollabPanel from '../components/CollabPanel'
import TopBar from '../components/TopBar'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import GlobalFooter from '../components/GlobalFooter'
import Notch from '../components/Notch'
import { useStageLoading } from '../hooks/useStageLoading'
import { useBlobUrlCache } from '../hooks/useBlobUrlCache'
import { useProjectStats } from '../hooks/useProjectStats'
import { supabase } from '../lib/supabaseClient'
import { fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { captureScreenshotWithWatermark } from '../utils/screenshotWithWatermark'
import { isTouchDevice } from '../utils/isTouchDevice'
import { enterPovMode, captureOrbitState, restoreOrbitState, reconnectOrbitControls } from '../utils/povCamera'
import { buildPovCollidersFromConfig } from '../components/pov/buildPovCollidersFromConfig'

function CollabPage() {
  const { projectId } = useParams()
  useSecurityLockdown()
  const {
    loadingManager,
    progress,
    status,
    loaded: stageLoaded,
    reset: resetStageLoading,
  } = useStageLoading({
    // No blob revoke — model blob in useBlobUrlCache, revoked on project change/unmount
  })

  const [modelUrl,        setModelUrl]        = useState(null)
  const [videoElement,    setVideoElement]    = useState(null)
  const [activeImageUrl,  setActiveImageUrl]  = useState(null)
  const [videoLoaded,     setVideoLoaded]     = useState(false)
  const [ledMaterialFound, setLedMaterialFound] = useState(false)
  const [isDbLoading,     setIsDbLoading]     = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)
  const [projectName, setProjectName] = useState('LIVE STAGE')
  const [versionStatus, setVersionStatus] = useState('')

  // ── Sun & Grid ───────────────────────────────────────────────────────────
  const [sunAzimuth,   setSunAzimuth]   = useState(45)
  const [sunElevation, setSunElevation] = useState(45)
  const [sunIntensity, setSunIntensity] = useState(1)
  const [gridCellSize, setGridCellSize] = useState(1)

  const [povHeightOffset, setPovHeightOffset] = useState(1.7)
  const [povMode, setPovMode] = useState(false)
  const [modelMetrics, setModelMetrics] = useState(null)
  const [meshMetadata, setMeshMetadata]           = useState([])
  const [povColliderConfig, setPovColliderConfig] = useState({ overrides: {} })
  const povColliderSpecs = useMemo(
    () => buildPovCollidersFromConfig(meshMetadata, povColliderConfig),
    [meshMetadata, povColliderConfig],
  )
  const savedOrbitRef = useRef(null)
  const povModeRef = useRef(false)
  const povExitInProgressRef = useRef(false)
  useEffect(() => {
    povModeRef.current = povMode
  }, [povMode])

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

  // ── Camera ───────────────────────────────────────────────────────────────
  const [cameraPresets, setCameraPresets] = useState([])
  const cameraControlsRef = useRef(null)
  const glDomElementRef = useRef(null)
  const cameraTargetPresetRef = useRef(null)
  const [autoplayIntervalSeconds, setAutoplayIntervalSeconds] = useState(10)
  const [cameraFlyDurationSeconds, setCameraFlyDurationSeconds] = useState(4)
  const [isAutoplayActive, setIsAutoplayActive] = useState(false)
  const autoplayIntervalRef = useRef(null)

  // ── LOCAL Virtual Camera (OBS/NDI) — does NOT sync to Admin ─────────────
  const [availableCameras, setAvailableCameras]   = useState([])
  const [selectedCameraId, setSelectedCameraId]   = useState('')
  const [localCameraStream, setLocalCameraStream] = useState(null)
  const [isLocalCameraActive, setIsLocalCameraActive] = useState(false)
  const localCameraVideoRef = useRef(null)
  
  // Store the "synced" video element from Admin so we can restore when local camera stops
  const syncedVideoElementRef = useRef(null)
  const syncedImageUrlRef = useRef(null)

  // ── Media playlist ────────────────────────────────────────────────────────
  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [isLooping,     setIsLooping]     = useState(true)
  const videoRef     = useRef(null)
  const clipCountRef = useRef(0)
  const playlistRef  = useRef([])
  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()
  useProjectStats(projectId, 'collab') // presence for LIVE PULSE
  const currentCameraRef = useRef(null)

  // Track blob URLs from local uploads (Collab-only) — revoked on clear/unmount
  const localBlobUrlsRef = useRef([])

  const sceneReady = !isDbLoading && !!modelUrl && stageLoaded

  useEffect(() => { playlistRef.current = videoPlaylist }, [videoPlaylist])

  useEffect(() => { resetStageLoading() }, [projectId, resetStageLoading])

  // ── Cleanup on unmount — useBlobUrlCache handles project blobs; revoke local blobs ──
  useEffect(() => {
    return () => {
      localBlobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url) } catch (_) {} })
      if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
      }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
      if (localCameraStream) {
        localCameraStream.getTracks().forEach(t => t.stop())
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Enumerate available cameras ─────────────────────────────────────────
  useEffect(() => {
    const enumerateCameras = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()))
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices.filter(d => d.kind === 'videoinput')
        setAvailableCameras(cameras)
      } catch {
        // Camera enumeration failed
      }
    }
    enumerateCameras()
    navigator.mediaDevices.addEventListener('devicechange', enumerateCameras)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateCameras)
  }, [])

  // ── LOCAL Camera Handlers (NO socket emission — local-only override) ────
  const handleStartLocalCamera = useCallback(async () => {
    if (!selectedCameraId) {
      alert('Please select a camera first')
      return
    }

    const video = localCameraVideoRef.current
    if (!video) return

    try {
      if (localCameraStream) {
        localCameraStream.getTracks().forEach(track => track.stop())
      }
      video.srcObject = null

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: selectedCameraId } }
      })

      const track = stream.getVideoTracks()[0]
      video.srcObject = stream

      if (track) {
        track.onended = () => handleStopLocalCamera()
      }

      await video.play()

      syncedVideoElementRef.current = videoElement
      syncedImageUrlRef.current = activeImageUrl

      if (videoRef.current) {
        videoRef.current.pause()
      }

      setVideoElement(video)
      setActiveImageUrl(null)
      setVideoLoaded(true)
      setLocalCameraStream(stream)
      setIsLocalCameraActive(true)

    } catch (err) {
      video.srcObject = null
      setLocalCameraStream(null)
      setIsLocalCameraActive(false)
      alert('Camera error: ' + err.message)
    }
  }, [selectedCameraId, localCameraStream, videoElement, activeImageUrl])

  const handleStopLocalCamera = useCallback(() => {
    if (localCameraStream) {
      localCameraStream.getTracks().forEach(track => track.stop())
    }

    if (localCameraVideoRef.current) {
      localCameraVideoRef.current.pause()
      localCameraVideoRef.current.srcObject = null
    }

    if (syncedVideoElementRef.current) {
      setVideoElement(syncedVideoElementRef.current)
      if (videoRef.current && !videoRef.current.paused === false) {
        videoRef.current.play().catch(() => {})
      }
    } else if (syncedImageUrlRef.current) {
      setActiveImageUrl(syncedImageUrlRef.current)
      setVideoElement(null)
    } else {
      setVideoElement(null)
    }

    setLocalCameraStream(null)
    setIsLocalCameraActive(false)
    syncedVideoElementRef.current = null
    syncedImageUrlRef.current = null
  }, [localCameraStream])

  // ── Video activation — blob URLs kept in cache until project change/unmount ──
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
      v.play().catch(() => {})
      videoRef.current = v
      setVideoElement(v)
      setVideoLoaded(true)
      setActiveVideoId(id)
      setIsPlaying(true)
      setIsLooping(true)
    })
    v.load()
  }, [])

  // ── Load project from Supabase ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function fetchProject() {
      resetPovSession()
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
            restored.push({ id: Date.now() + i, name: item.name, url, type: item.type, external: true })
          }
          return restored
        }

        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = await loadMediaPlaylist(data.media_playlist)
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
          let vidUrl = data.video_url
          if (isRemote(vidUrl)) {
            try {
              const blobUrl = await fetchAsBlobUrlWithCache(vidUrl)
              addBlob(blobUrl)
              vidUrl = blobUrl
            } catch {}
          }
          const id = Date.now()
          clipCountRef.current = 1
          setVideoPlaylist([{ id, name: 'Published Video', type: 'video', url: vidUrl, external: true }])
          activateVideo(id, vidUrl)
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)
        setPovHeightOffset(typeof data.pov_height_offset === 'number' ? data.pov_height_offset : 1.7)
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
          setTransparentLedConfig(prev => ({
            ...prev,
            ...(cfg.transparentLedConfig || cfg.transparentLed || {}),
          }))

          if (cfg.customHdriUrl) {
            const hdriSrc = cfg.customHdriUrl.replace('visual.tooawake.online', 'visual.tooawake.mov')
            const basePath = hdriSrc.split('?')[0] || hdriSrc
            const rawExt = basePath.split('.').pop()?.toLowerCase() || 'hdr'
            setHdriFileExt(['hdr', 'exr'].includes(rawExt) ? rawExt : 'hdr')
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

          // ★ Sun lighting - load from Admin's saved config for consistency
          if (cfg.sunIntensity != null) setSunIntensity(cfg.sunIntensity)
          if (cfg.sunAzimuth != null)   setSunAzimuth(cfg.sunAzimuth)
          if (cfg.sunElevation != null) setSunElevation(cfg.sunElevation)
          if (cfg.autoplayIntervalSeconds != null) setAutoplayIntervalSeconds(cfg.autoplayIntervalSeconds)
          if (cfg.cameraFlyDurationSeconds != null) setCameraFlyDurationSeconds(cfg.cameraFlyDurationSeconds)
          if (cfg.versionStatus != null) setVersionStatus(cfg.versionStatus)
          setPovColliderConfig(cfg.povColliderConfig ?? { overrides: {} })
        }
      } catch {
        if (!cancelled) setProjectNotFound(true)
      } finally {
        if (!cancelled) setIsDbLoading(false)
      }
    }

    fetchProject()
    return () => { cancelled = true }
  }, [projectId, activateVideo, addBlob, revokeAllBlobs, resetPovSession])

  // ── Handlers for locally-added media (blob URL only, never uploaded) ─────
  // ── File validation to prevent heavy formats (MOV, AVI) from crashing ────
  const ALLOWED_VIDEO_EXT = ['mp4', 'webm']
  const ALLOWED_IMAGE_EXT = ['webp', 'png', 'jpg', 'jpeg', 'gif']
  const ALLOWED_MIME_VIDEO = ['video/mp4', 'video/webm']
  const ALLOWED_MIME_IMAGE = ['image/webp', 'image/png', 'image/jpeg', 'image/gif']

  const validateMediaFile = useCallback((file) => {
    if (!file) return false
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const mime = file.type.toLowerCase()

    const isValidVideo = ALLOWED_VIDEO_EXT.includes(ext) || ALLOWED_MIME_VIDEO.includes(mime)
    const isValidImage = ALLOWED_IMAGE_EXT.includes(ext) || ALLOWED_MIME_IMAGE.includes(mime)

    if (!isValidVideo && !isValidImage) {
      alert(`⚠️ FORMAT NOT SUPPORTED.\n\nPLEASE USE MP4/WEBM FOR VIDEOS.\nPLEASE USE WEBP/PNG/JPG FOR IMAGES.\n\nFile: ${file.name}`)
      return false
    }
    return true
  }, [])

  const handleVideoUpload = useCallback((file) => {
    if (!file) return
    // VALIDATION: Block unsupported formats before creating blob URL
    if (!validateMediaFile(file)) return

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
  }, [activateVideo, validateMediaFile])

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

  const handlePlay       = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true)  }, [])
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
    if (url) {
      const basePath = url.split('?')[0] || url
      const rawExt = basePath.split('.').pop()?.toLowerCase() || 'hdr'
      setHdriFileExt(['hdr', 'exr'].includes(rawExt) ? rawExt : 'hdr')
    }
    setCustomHdriUrl(url)
    setHdriPreset('none')
  }, [customHdriUrl])

  // ★ CLEAR ALL HDRI — aggressive cleanup
  const handleClearAllHdri = useCallback(() => {
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(null)
    setHdriPreset('none')
    setHdriLoading(false)
  }, [customHdriUrl])

  // Handle HDRI load errors — auto-clear
  const handleHdriLoadError = useCallback(() => {
    setHdriLoading(false)
  }, [])

  // ── Camera navigation (read-only) ────────────────────────────────────────
  const handleGoToView = useCallback((preset) => {
    setCameraTargetPreset(cameraTargetPresetRef, preset)
    currentCameraRef.current = preset?.name || null
  }, [])

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
        reconnectOrbitControls(ctrl, glDomElementRef.current)
        await restoreOrbitState(ctrl, savedOrbitRef.current, { animate: false })
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

  const resetPovSession = useCallback(() => {
    if (document.pointerLockElement) {
      try { document.exitPointerLock() } catch (_) {}
    }
    const ctrl = cameraControlsRef.current
    if (ctrl) reconnectOrbitControls(ctrl, glDomElementRef.current)
    savedOrbitRef.current = null
    povExitInProgressRef.current = false
    povModeRef.current = false
    setPovMode(false)
    setMeshMetadata([])
  }, [])

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

  // ── Screenshot ────────────────────────────────────────────────────────────
  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const dataUrl = captureScreenshotWithWatermark(canvas, projectName, versionStatus)
    const a = document.createElement('a')
    a.download = `Stage_Collab_${projectId}.png`
    a.href = dataUrl
    a.click()
  }, [projectId, projectName, versionStatus])

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
        onLedMaterialStatus={setLedMaterialFound}
        sunPosition={sunPosition}
        sunIntensity={sunIntensity}
        gridCellSize={gridCellSize}
        modelLoaded={!!modelUrl}
        cameraControlsRef={cameraControlsRef}
        glDomElementRef={glDomElementRef}
        cameraTargetPresetRef={cameraTargetPresetRef}
        cameraFlyDurationSeconds={cameraFlyDurationSeconds}
        onModelMetricsChange={setModelMetrics}
        onMeshScanChange={setMeshMetadata}
        stageColliders={povColliderSpecs}
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
          // ── LOCAL Virtual Camera (doesn't sync to others) ────────────────
          availableCameras={availableCameras}
          selectedCameraId={selectedCameraId}
          onCameraSelect={setSelectedCameraId}
          isLocalCameraActive={isLocalCameraActive}
          onStartLocalCamera={handleStartLocalCamera}
          onStopLocalCamera={handleStopLocalCamera}
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
          isAutoplayActive={isAutoplayActive}
          onToggleAutoplay={handleToggleAutoplay}
          // ── Screenshot ───────────────────────────────────────────────────
          onScreenshot={handleScreenshot}
          povMode={povMode}
          onPovToggle={handlePovToggle}
          showPovControl={!isTouchDevice() && !!modelUrl && !!modelMetrics && sceneReady}
        />

        <TopBar role={null} color="cyan" />
        <Notch status={versionStatus} />

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg px-5 py-2 text-white/40 text-xs pointer-events-none">
          Project: <span className="text-white/60 font-mono">{projectId}</span>
        </div>
      </StageCanvas>

      {/* LOCAL Camera video element (visible preview when active) */}
      <video
        ref={localCameraVideoRef}
        id="collab-local-camera-feed"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: isLocalCameraActive ? 120 : 1,
          height: isLocalCameraActive ? 68 : 1,
          opacity: isLocalCameraActive ? 0.8 : 0.01,
          pointerEvents: 'none',
          zIndex: 9999,
          borderRadius: 4,
          border: isLocalCameraActive ? '2px solid #22d3ee' : 'none'
        }}
        playsInline
        muted
        autoPlay
      />

      <GlobalFooter projectName={projectName} />
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

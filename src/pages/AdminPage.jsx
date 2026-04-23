import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { fetchAndCacheAsset } from '../utils/secureAssetLoader'
import StageCanvas from '../components/StageCanvas'
import UIPanel     from '../components/UIPanel'
import TopBar      from '../components/TopBar'
import ProjectsDashboard from '../components/ProjectsDashboard'
import ClientRadarPanel from '../components/ClientRadarPanel'
import GlobalFooter from '../components/GlobalFooter'
import { supabase } from '../lib/supabaseClient'
import useHdriPresets from '../hooks/useHdriPresets'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
import { getPresignedUploadUrl, uploadFileToPresignedUrl, getUploadErrorMessage } from '../utils/r2Upload'

function AdminPage() {
  // ── Stage model ──────────────────────────────────────────────────────────
  const [stageFile,    setStageFile]    = useState(null)
  const [stageUrl,     setStageUrl]     = useState(null)   // local blob preview (from file)
  const [cloudStageUrl, setCloudStageUrl] = useState(null) // published or external URL

  // ── Video / Image ────────────────────────────────────────────────────────
  const [videoElement,   setVideoElement]   = useState(null)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [videoLoaded,    setVideoLoaded]    = useState(false)

  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [isLooping,     setIsLooping]     = useState(true)
  const videoRef     = useRef(null)
  const clipCountRef = useRef(0)

  // ── Virtual Camera (OBS Virtual Cam / NDI) ───────────────────────────────
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [cameraStream,     setCameraStream]     = useState(null)
  const [isCameraStreaming, setIsCameraStreaming] = useState(false)
  const cameraVideoRef = useRef(null)

  // Local blob URLs created for admin preview — revoke on unmount
  const localBlobUrlsRef = useRef([])

  // ── LED Material ─────────────────────────────────────────────────────────
  const [ledMaterialFound, setLedMaterialFound] = useState(false)

  // ── Sun & Grid ───────────────────────────────────────────────────────────
  const [sunAzimuth,   setSunAzimuth]   = useState(45)
  const [sunElevation, setSunElevation] = useState(45)
  const [sunIntensity, setSunIntensity] = useState(1)
  const [gridCellSize, setGridCellSize] = useState(1)

  // ── Sun position vector (must be declared before any useCallback that uses it) ──
  const sunPosition = useMemo(() => {
    const az = (sunAzimuth   * Math.PI) / 180
    const el = (sunElevation * Math.PI) / 180
    const d  = 15
    return [d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az)]
  }, [sunAzimuth, sunElevation])

  // ── Camera presets ───────────────────────────────────────────────────────
  const [cameraPresets, setCameraPresets] = useState([])
  const cameraControlsRef = useRef(null)
  const cameraTargetPresetRef = useRef(null)
  const [autoplayIntervalSeconds, setAutoplayIntervalSeconds] = useState(10)
  const [cameraFlyDurationSeconds, setCameraFlyDurationSeconds] = useState(4)

  // ── Publish ──────────────────────────────────────────────────────────────
  const [publishedId,   setPublishedId]   = useState(null)
  const [isPublishing,  setIsPublishing]  = useState(false)
  const [publishStatus, setPublishStatus] = useState(null)  // 'success' | 'error' | null
  const [publishError,  setPublishError]  = useState(null)
  const [projectName,   setProjectName]   = useState('')
  const [versionStatus, setVersionStatus] = useState('')

  // ── Scene config — environment, HDRI, bloom ──────────────────────────────
  const [hdriPreset,    setHdriPreset]    = useState('none')
  const [hdriFile,      setHdriFile]      = useState(null)
  const [hdriFileExt,   setHdriFileExt]   = useState('hdr')   // 'hdr' | 'exr'
  const [customHdriUrl, setCustomHdriUrl] = useState(null)
  const [hdriLoading,   setHdriLoading]   = useState(false)   // loading lock
  const [hdriError,     setHdriError]     = useState(null)    // transient inline banner (no alert())
  const hdriErrorTimerRef = useRef(null)

  // HDRI presets from NAS with validation helpers
  const { presets: hdriPresets } = useHdriPresets()
  const [envIntensity,       setEnvIntensity]       = useState(1)
  const [bgBlur,             setBgBlur]             = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength,      setBloomStrength]      = useState(0.3)

  // ── Visual integrity — bloom threshold, LED color protection ─────────────
  const [bloomThreshold, setBloomThreshold] = useState(1.2)
  const [protectLed,     setProtectLed]     = useState(true)
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

  // ── HDRI cloud upload ─────────────────────────────────────────────────────
  const [isUploadingHdri, setIsUploadingHdri] = useState(false)

  // ── R2 direct upload (replaces NAS) ─────────────────────────────────────
  const [isR2Uploading, setIsR2Uploading] = useState(false)
  const [r2UploadProgress, setR2UploadProgress] = useState(null) // 0–100 or null
  const [r2Error, setR2Error] = useState(null)

  // ── Dashboard ────────────────────────────────────────────────────────────
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)
  const [cloneToast, setCloneToast] = useState(null)

  // ── Resolve external stage URL through cache for 3D preview ─────────────────
  const isRemote = useCallback(
    (u) => u && (u.startsWith('http://') || u.startsWith('https://')),
    []
  )

  // ── Revoke resolved blob when URL changes or unmount ───────────────────────
  useEffect(() => {
    return () => {
      if (hdriErrorTimerRef.current) clearTimeout(hdriErrorTimerRef.current)
    }
  }, [])

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localBlobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch (_) {} })
      if (stageUrl && stageUrl.startsWith('blob:')) { try { URL.revokeObjectURL(stageUrl) } catch (_) {} }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
      // Camera stream cleanup
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause()
        cameraVideoRef.current.srcObject = null
      }
    }
  }, [])

  // ── Enumerate available cameras on mount ─────────────────────────────────
  useEffect(() => {
    const enumerateCameras = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()))
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices.filter(d => d.kind === 'videoinput')
        setAvailableCameras(cameras)
      } catch {
        // Camera enumeration failed - likely permission denied
      }
    }
    enumerateCameras()

    // Re-enumerate when devices change (e.g., OBS Virtual Camera starts)
    navigator.mediaDevices.addEventListener('devicechange', enumerateCameras)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateCameras)
  }, [])

  // Revoke HDRI blob URL whenever it changes (new file selected) or on unmount.
  // handleCustomHdriUpload already revokes synchronously; this covers edge cases
  // such as navigating away mid-session or hot-reloading in dev.
  useEffect(() => {
    return () => {
      if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
      }
    }
  }, [customHdriUrl])

  // ── Video helpers ────────────────────────────────────────────────────────
  const activateVideo = useCallback((id, url) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    const v = document.createElement('video')
    v.src = url; v.crossOrigin = 'anonymous'; v.loop = true
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      v.play().catch(() => {})
      videoRef.current = v
      setVideoElement(v); setVideoLoaded(true)
      setActiveVideoId(id); setIsPlaying(true); setIsLooping(true)
    })
    v.load()
  }, [])

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

  const handleExternalVideoAdd = useCallback((externalUrl, label) => {
    if (!externalUrl) return
    clipCountRef.current += 1
    const id   = Date.now()
    const name = label || `External ${clipCountRef.current}`
    setVideoPlaylist(prev => [...prev, { id, name, url: externalUrl, type: 'video', external: true }])
    setActiveImageUrl(null)
    activateVideo(id, externalUrl)
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
    clipCountRef.current = 0; localBlobUrlsRef.current = []
  }, [])

  const handleRenameClip = useCallback((clipId, newName) => {
    setVideoPlaylist(prev =>
      prev.map(c => c.id === clipId ? { ...c, name: newName } : c)
    )
  }, [])

  const handleReorderPlaylist = useCallback(async (newOrder) => {
    setVideoPlaylist(newOrder)
    if (publishedId && newOrder.length > 0) {
      const mediaForDb = newOrder.map(c => ({ name: c.name, url: c.url, type: c.type, external: c.external ?? false }))
      await supabase.from('projects').update({ media_playlist: mediaForDb }).eq('id', publishedId)
    }
  }, [publishedId])

  const handleDeleteClip = useCallback((clipId) => {
    setVideoPlaylist(prev => {
      const clip = prev.find(c => c.id === clipId)
      if (clip?.url && localBlobUrlsRef.current.includes(clip.url)) {
        try { URL.revokeObjectURL(clip.url) } catch (_) {}
        localBlobUrlsRef.current = localBlobUrlsRef.current.filter(u => u !== clip.url)
      }
      const next = prev.filter(c => c.id !== clipId)
      if (clip?.id === activeVideoId) {
        if (next.length > 0) {
          const first = next[0]
          if (first.type === 'image') {
            setVideoElement(null); setActiveImageUrl(first.url); setActiveVideoId(first.id); setVideoLoaded(true); setIsPlaying(false)
          } else {
            activateVideo(first.id, first.url)
          }
        } else {
          if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
          setVideoElement(null); setActiveImageUrl(null); setVideoLoaded(false); setActiveVideoId(null); setIsPlaying(false)
        }
      }
      return next
    })
  }, [activeVideoId, activateVideo])

  const handlePlay       = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true)  }, [])
  const handlePause      = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])
  const handleToggleLoop = useCallback(() => {
    if (videoRef.current) { videoRef.current.loop = !videoRef.current.loop; setIsLooping(videoRef.current.loop) }
  }, [])

  // ── Virtual Camera Handlers (OBS Virtual Cam / NDI) ─────────────────────
  const handleStartCameraStream = useCallback(async () => {
    if (!selectedCameraId) {
      alert('Please select a camera first')
      return
    }

    const video = cameraVideoRef.current
    if (!video) return

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop())
      }
      video.srcObject = null

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: selectedCameraId } }
      })

      const track = stream.getVideoTracks()[0]
      video.srcObject = stream

      if (track) {
        track.onended = () => handleStopCameraStream()
      }

      await video.play()

      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
      }

      setVideoElement(video)
      setActiveImageUrl(null)
      setActiveVideoId(null)
      setIsPlaying(false)
      setVideoLoaded(true)
      setCameraStream(stream)
      setIsCameraStreaming(true)

    } catch (err) {
      video.srcObject = null
      setCameraStream(null)
      setIsCameraStreaming(false)
      alert('Camera error: ' + err.message)
    }
  }, [selectedCameraId, cameraStream])

  const handleStopCameraStream = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause()
      cameraVideoRef.current.srcObject = null
    }

    setCameraStream(null)
    setIsCameraStreaming(false)
    setVideoElement(null)
    setVideoLoaded(false)
  }, [cameraStream])

  // ── Custom HDRI — always loaded from local RAM (blob URL), never auto-uploaded ──
  // The blob URL is passed directly to <Environment files={blobUrl} />, which
  // bypasses Supabase Storage entirely and avoids all CORS issues.
  const handleCustomHdriUpload = useCallback((file) => {
    if (!file) return
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    const ext = file.name.split('.').pop().toLowerCase() || 'hdr'
    const url = URL.createObjectURL(file)
    setHdriFileExt(ext)
    setHdriFile(file)
    setCustomHdriUrl(url)
    setHdriPreset('none')
  }, [customHdriUrl])

  // Explicit opt-in: upload the local HDRI to Supabase so it becomes permanent
  // and visible to Collab/View clients. Requires an existing published project.
  const handleUploadHdriToCloud = useCallback(async () => {
    if (!hdriFile || !publishedId) return
    setIsUploadingHdri(true)
    try {
      const ext      = hdriFile.name.split('.').pop() || 'hdr'
      const hdriPath = `${publishedId}/environment.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('projects')
        .upload(hdriPath, hdriFile, { upsert: true })
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

      const { data: hdriPublic } = supabase.storage.from('projects').getPublicUrl(hdriPath)
      const cloudUrl = hdriPublic.publicUrl

      // Revoke the blob — we now have a permanent URL
      if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
      }
      setCustomHdriUrl(cloudUrl)
      setHdriFile(null)
    } catch (err) {
      alert(`HDRI upload failed: ${err.message}`)
    } finally {
      setIsUploadingHdri(false)
    }
  }, [hdriFile, publishedId, customHdriUrl])

  // Clear the active custom HDRI (local or cloud) — returns to preset picker
  const handleClearHdri = useCallback(() => {
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(null)
    setHdriFile(null)
    setHdriFileExt('hdr')
  }, [customHdriUrl])

  // ★ CLEAR ALL HDRI — aggressive cleanup for GPU stability
  const handleClearAllHdri = useCallback(() => {
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(null)
    setHdriFile(null)
    setHdriFileExt('hdr')
    setHdriPreset('none')
    setHdriLoading(false)
  }, [customHdriUrl])

  // Handle HDRI load errors — auto-clear to prevent stuck UI (non-blocking banner)
  const handleHdriLoadError = useCallback((_errorMsg) => {
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(null)
    setHdriPreset('none')
    setHdriFile(null)
    setHdriLoading(false)
    setHdriError('HDRI failed to load — environment cleared.')
    if (hdriErrorTimerRef.current) clearTimeout(hdriErrorTimerRef.current)
    hdriErrorTimerRef.current = setTimeout(() => setHdriError(null), 5000)
  }, [customHdriUrl])

  // ── R2 direct upload — video / image ────────────────────────────────────
  const handleR2MediaUpload = useCallback(async (file) => {
    if (!file) return
    if (!validateMediaFile(file)) return
    if (!projectName.trim()) {
      alert('Please enter a project name before uploading.')
      return
    }
    setIsR2Uploading(true); setR2Error(null); setR2UploadProgress(0)
    try {
      const { putUrl, publicUrl } = await getPresignedUploadUrl({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        projectId: publishedId || undefined,
        type: 'media',
      })
      const finalUrl = await uploadFileToPresignedUrl(
        putUrl,
        file,
        publicUrl,
        (percent) => setR2UploadProgress(percent)
      )

      clipCountRef.current += 1
      const id = Date.now()
      const isImg = file.type.startsWith('image/')
      const name = file.name.replace(/\.[^/.]+$/, '') || (isImg ? `R2 Image ${clipCountRef.current}` : `R2 Clip ${clipCountRef.current}`)
      const clip = { id, name, url: finalUrl, type: isImg ? 'image' : 'video', external: true }
      const updatedPlaylist = [...videoPlaylist, clip]
      setVideoPlaylist(updatedPlaylist)

      if (publishedId) {
        const mediaForDb = updatedPlaylist.map(c => ({ name: c.name, url: c.url, type: c.type, external: c.external ?? true }))
        await supabase.from('projects').update({ media_playlist: mediaForDb }).eq('id', publishedId)
      }

      if (isImg) {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
        setVideoElement(null); setActiveImageUrl(finalUrl)
        setActiveVideoId(id); setVideoLoaded(true); setIsPlaying(false)
      } else {
        setActiveImageUrl(null); activateVideo(id, finalUrl)
      }
    } catch (err) {
      setR2Error(getUploadErrorMessage(err))
    } finally {
      setIsR2Uploading(false); setR2UploadProgress(null)
    }
  }, [projectName, publishedId, videoPlaylist, activateVideo, validateMediaFile])

  // ── R2 direct upload — HDRI ────────────────────────────────────────────
  const handleR2HdriUpload = useCallback(async (file) => {
    if (!file) return
    if (!projectName.trim()) {
      alert('Please enter a project name before uploading.')
      return
    }
    setIsR2Uploading(true); setR2Error(null); setR2UploadProgress(0)
    try {
      const { putUrl, publicUrl } = await getPresignedUploadUrl({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        projectId: publishedId || undefined,
        type: 'hdri',
      })
      const finalUrl = await uploadFileToPresignedUrl(
        putUrl,
        file,
        publicUrl,
        (percent) => setR2UploadProgress(percent)
      )

      if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
      }
      setCustomHdriUrl(finalUrl)
      setHdriFile(null)
      setHdriPreset('none')
    } catch (err) {
      setR2Error(getUploadErrorMessage(err))
    } finally {
      setIsR2Uploading(false); setR2UploadProgress(null)
    }
  }, [projectName, publishedId, customHdriUrl])

  // ── External HDRI URL — paste a direct link to an .hdr / .exr file ─────
  const handleExternalHdriUrl = useCallback((url) => {
    if (!url) return
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(url)
    setHdriFile(null)
    setHdriPreset('none')
  }, [customHdriUrl])

  // ── Stage model upload ───────────────────────────────────────────────────
  const handleModelUpload = useCallback((file) => {
    if (!file) return
    if (stageUrl && stageUrl.startsWith('blob:')) URL.revokeObjectURL(stageUrl)
    const url = URL.createObjectURL(file)
    setStageFile(file); setStageUrl(url); setCloudStageUrl(null)
  }, [stageUrl])

  // ── External stage URL (R2, CDN) — store URL, resolve for preview via cache ─
  const handleExternalStageUrl = useCallback((url) => {
    if (!url?.trim()) return
    if (stageUrl && stageUrl.startsWith('blob:')) URL.revokeObjectURL(stageUrl)
    setStageFile(null)
    setStageUrl(null)
    setCloudStageUrl(url.trim())
  }, [stageUrl])

  // ── Camera preset helpers ────────────────────────────────────────────────
  const handleSaveView = useCallback((name) => {
    if (!cameraControlsRef.current) return
    const ctrl = cameraControlsRef.current
    const posVal = ctrl.getPosition?.() ?? { x: 0, y: 5, z: 10 }
    const tgtVal = ctrl.getTarget?.() ?? { x: 0, y: 0, z: 0 }
    const pos = { x: posVal.x, y: posVal.y, z: posVal.z }
    const tgt = { x: tgtVal.x, y: tgtVal.y, z: tgtVal.z }
    setCameraPresets(prev => [...prev, { id: Date.now(), name, position: pos, target: tgt }])
  }, [])

  const handleGoToView = useCallback((preset) => {
    setCameraTargetPreset(cameraTargetPresetRef, preset)
  }, [])

  const handleSaveAutoplayConfig = useCallback(async () => {
    if (!publishedId) {
      alert('Publish the project first, then save autoplay config.')
      return
    }
    try {
      const { data: existing } = await supabase.from('projects').select('scene_config').eq('id', publishedId).single()
      const cfg = existing?.scene_config || {}
      const scene_config = {
        ...cfg,
        autoplayIntervalSeconds,
        cameraFlyDurationSeconds,
        versionStatus: versionStatus || '',
      }
      const { error } = await supabase.from('projects').update({
        camera_presets: cameraPresets,
        scene_config,
      }).eq('id', publishedId)
      if (error) throw error
      alert('Autoplay config saved.')
    } catch (err) {
      alert('Failed to save autoplay config: ' + err.message)
    }
  }, [publishedId, cameraPresets, autoplayIntervalSeconds, cameraFlyDurationSeconds, versionStatus])

  const handleDeletePreset = useCallback((id) => {
    setCameraPresets(prev => prev.filter(p => p.id !== id))
  }, [])

  // ── Open project from dashboard ──────────────────────────────────────────
  const handleOpenProject = useCallback(async (project) => {
    // Refetch project to get latest media_playlist (multi-admin sync)
    const { data: fresh, error } = await supabase.from('projects').select('*').eq('id', project.id).single()
    const p = fresh && !error ? fresh : project

    // Revoke existing local blob URLs
    localBlobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch (_) {} })
    localBlobUrlsRef.current = []
    if (stageUrl && stageUrl.startsWith('blob:')) { try { URL.revokeObjectURL(stageUrl) } catch (_) {} }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }

    // Reset all state to match the opened project
    setStageFile(null)
    setStageUrl(null)
    setCloudStageUrl(p.stage_url || null)
    setVideoElement(null)
    setActiveImageUrl(null)
    setVideoLoaded(false)
    setVideoPlaylist([])
    clipCountRef.current = 0
    setActiveVideoId(null)
    setIsPlaying(false)
    setCameraPresets(p.camera_presets || [])
    setGridCellSize(p.grid_cell_size ?? 1)
    setPublishedId(p.id)
    setProjectName(p.name || '')
    setVersionStatus(p.scene_config?.versionStatus ?? '')
    setPublishStatus(null)
    setPublishError(null)
    setIsDashboardOpen(false)
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

    // Restore scene_config if present — all lighting values for consistency
    const cfg = p.scene_config
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
      setTransparentLedConfig(prev => ({
        ...prev,
        ...(cfg.transparentLedConfig || cfg.transparentLed || {}),
      }))
      setHdriFile(null)

      // ★ Sun lighting - MUST load these for consistency with Client/Collab
      if (cfg.sunIntensity != null)  setSunIntensity(cfg.sunIntensity)
      if (cfg.sunAzimuth != null)    setSunAzimuth(cfg.sunAzimuth)
      if (cfg.sunElevation != null)  setSunElevation(cfg.sunElevation)

      // HDRI URL — resolve remote URLs via blob cache (same idea as ClientPage)
      if (cfg.customHdriUrl) {
        const hdriSrc = cfg.customHdriUrl.replace('visual.tooawake.online', 'visual.tooawake.mov')
        const basePath = hdriSrc.split('?')[0] || hdriSrc
        const rawExt = basePath.split('.').pop()?.toLowerCase() || 'hdr'
        setHdriFileExt(['hdr', 'exr'].includes(rawExt) ? rawExt : 'hdr')
        if (isRemote(hdriSrc)) {
          fetchAndCacheAsset(hdriSrc)
            .then((blobUrl) => {
              localBlobUrlsRef.current.push(blobUrl)
              setCustomHdriUrl(blobUrl)
            })
            .catch(() => {
              setCustomHdriUrl(hdriSrc)
            })
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
    }

    // Restore full media playlist from fresh refetch (multi-admin sync), or fall back to legacy single video_url
    if (p.media_playlist && p.media_playlist.length > 0) {
      const restored = p.media_playlist.map((item, i) => ({
        id:       Date.now() + i,
        name:     item.name,
        url:      item.url,
        type:     item.type,
        external: true,
      }))
      clipCountRef.current = restored.length
      setVideoPlaylist(restored)

      // Auto-activate the first clip
      const first = restored[0]
      if (first.type === 'image') {
        setActiveImageUrl(first.url)
        setActiveVideoId(first.id)
        setVideoLoaded(true)
        setIsPlaying(false)
      } else {
        activateVideo(first.id, first.url)
      }
    } else if (p.video_url) {
      const id = Date.now()
      clipCountRef.current = 1
      const clip = { id, name: 'Cloud Video', url: p.video_url, type: 'video', external: true }
      setVideoPlaylist([clip])
      activateVideo(id, p.video_url)
    }
  }, [stageUrl, activateVideo, isRemote])

  // ── Clone as New Round (from Publish panel) ───────────────────────────────
  const handleCloneAsNewRound = useCallback(async () => {
    if (!publishedId) return
    const name = window.prompt('Enter name for the new round:', `${projectName || 'Untitled'} - Round 2`)
    if (!name || !name.trim()) return
    try {
      const { data: newId, error: rpcErr } = await supabase.rpc('clone_project', {
        p_source_id: publishedId,
        p_new_name: name.trim(),
      })
      if (rpcErr) {
        setPublishStatus('error')
        setPublishError(`Clone failed: ${rpcErr.message}`)
        return
      }
      if (!newId) {
        setPublishStatus('error')
        setPublishError('Clone failed: source project not found.')
        return
      }
      const { data: newProject, error: fetchErr } = await supabase
        .from('projects')
        .select('*')
        .eq('id', newId)
        .single()
      if (fetchErr || !newProject) {
        setPublishStatus('error')
        setPublishError('Cloned but failed to load. Refresh the list.')
        return
      }
      setCloneToast('Project cloned successfully. Ready for new media assets.')
      setTimeout(() => setCloneToast(null), 4000)
      handleOpenProject(newProject)
    } catch (err) {
      setPublishStatus('error')
      setPublishError(`Unexpected error: ${err.message}`)
    }
  }, [publishedId, projectName, handleOpenProject])

  // ── Publish ──────────────────────────────────────────────────────────────
  const canPublish = !!(stageFile || cloudStageUrl)

  const handlePublish = useCallback(async ({ videoInputMode, externalVideoUrl }) => {
    if (!stageFile && !cloudStageUrl) return

    if (!projectName.trim()) {
      setPublishStatus('error')
      setPublishError('Please enter a project name before publishing.')
      return
    }

    setIsPublishing(true); setPublishStatus(null); setPublishError(null)

    try {
      const projectId = publishedId || crypto.randomUUID()

      // 1. Upload stage model only if a new file was chosen
      let finalStageUrl = cloudStageUrl
      if (stageFile) {
        const { putUrl, publicUrl } = await getPresignedUploadUrl({
          filename: stageFile.name || 'stage.glb',
          contentType: stageFile.type || 'model/gltf-binary',
          projectId,
          type: 'stage',
        })
        finalStageUrl = await uploadFileToPresignedUrl(putUrl, stageFile, publicUrl, null)
      }

      // 2. Upload ALL playlist items (videos + images) to Supabase Storage.
      //    Each clip gets its own path: {projectId}/media/{index}_{sanitised_name}.{ext}
      //    External / already-cloud URLs are kept as-is.
      const mediaPlaylist = []
      for (let i = 0; i < videoPlaylist.length; i++) {
        const clip = videoPlaylist[i]
        let cloudUrl = clip.url

        if (clip.file && !clip.external) {
          const ext       = clip.file.name.split('.').pop() || (clip.type === 'image' ? 'png' : 'mp4')
          const safeName  = clip.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const mediaPath = `${projectId}/media/${i}_${safeName}`
          const { error: mediaErr } = await supabase.storage
            .from('projects')
            .upload(mediaPath, clip.file, { upsert: true })
          if (mediaErr) throw new Error(`Media upload failed (${clip.name}): ${mediaErr.message}`)
          const { data: mediaPublic } = supabase.storage.from('projects').getPublicUrl(mediaPath)
          cloudUrl = mediaPublic.publicUrl
        }

        mediaPlaylist.push({
          name: clip.name,
          url:  cloudUrl,
          type: clip.type,
          external: clip.external || false,
        })
      }

      // Keep legacy video_url pointing to the first video for backwards compatibility
      const firstVideo = mediaPlaylist.find(c => c.type === 'video')
      const finalVideoUrl = firstVideo ? firstVideo.url : null

      // 3. HDRI
      const finalHdriUrl = (customHdriUrl && !customHdriUrl.startsWith('blob:'))
        ? customHdriUrl
        : null

      // 4. Build scene_config snapshot
      const az = (sunAzimuth   * Math.PI) / 180
      const el = (sunElevation * Math.PI) / 180
      const d  = 15
      // LITE & STABLE: Save all lighting values for consistency across pages
      const scene_config = {
        floorReflection:     true,
        hdriPreset:          hdriPreset,
        customHdriUrl:       finalHdriUrl,
        envIntensity:        envIntensity,
        bgBlur:              bgBlur,
        showHdriBackground:  showHdriBackground,
        bloomStrength:       bloomStrength,
        bloomThreshold:      bloomThreshold,
        protectLed:          protectLed,
        transparentLedConfig: transparentLedConfig,
        // ★ Sun lighting - save all values for Client/Collab consistency
        sunPosition:         [d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az)],
        sunIntensity:        sunIntensity,
        sunAzimuth:          sunAzimuth,
        sunElevation:        sunElevation,
        autoplayIntervalSeconds: autoplayIntervalSeconds,
        cameraFlyDurationSeconds: cameraFlyDurationSeconds,
        versionStatus: versionStatus || '',
      }

      // 5. Upsert project record
      // NOTE: Requires a `media_playlist` JSONB column in Supabase:
      //   ALTER TABLE projects ADD COLUMN IF NOT EXISTS media_playlist jsonb;
      const record = {
        id:              projectId,
        stage_url:       finalStageUrl,
        video_url:       finalVideoUrl,
        media_playlist:  mediaPlaylist,
        camera_presets:  cameraPresets,
        grid_cell_size:  gridCellSize,
        name:            projectName || 'Untitled Project',
        scene_config,
      }

      const { error: dbErr } = await supabase.from('projects').upsert(record)
      if (dbErr) throw new Error(`Database save failed: ${dbErr.message}`)

      // Mark playlist clips as cloud-backed so re-publish won't re-upload
      setVideoPlaylist(prev => prev.map((clip, i) => ({
        ...clip,
        url:      mediaPlaylist[i]?.url ?? clip.url,
        external: true,
        file:     undefined,
      })))

      setPublishedId(projectId)
      setCloudStageUrl(finalStageUrl)
      setPublishStatus('success')
      setStageFile(null)
    } catch (err) {
      setPublishStatus('error')
      setPublishError(err.message || 'Unknown error')
    } finally {
      setIsPublishing(false)
    }
  }, [stageFile, cloudStageUrl, publishedId, videoPlaylist, activeVideoId, cameraPresets, gridCellSize, projectName,
      hdriPreset, customHdriUrl, envIntensity, bgBlur, showHdriBackground, bloomStrength, sunAzimuth, sunElevation,
      bloomThreshold, protectLed, transparentLedConfig, sunIntensity, autoplayIntervalSeconds, cameraFlyDurationSeconds, versionStatus])

  // ── Derived HDRI state passed to UIPanel ─────────────────────────────────
  const hasLocalHdri = !!(customHdriUrl && customHdriUrl.startsWith('blob:'))
  const hasCloudHdri = !!(customHdriUrl && !customHdriUrl.startsWith('blob:'))

  return (
    <div className="w-full h-full relative">
      <StageCanvas
        modelUrl={stageUrl || cloudStageUrl}
        videoElement={videoElement}
        activeImageUrl={activeImageUrl}
        onLedMaterialStatus={setLedMaterialFound}
        sunPosition={sunPosition}
        sunIntensity={sunIntensity}
        gridCellSize={gridCellSize}
        modelLoaded={!!(stageFile || cloudStageUrl)}
        cameraControlsRef={cameraControlsRef}
        cameraTargetPresetRef={cameraTargetPresetRef}
        cameraFlyDurationSeconds={cameraFlyDurationSeconds}
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
        <UIPanel
          onModelUpload={handleModelUpload}
          onExternalStageUrl={handleExternalStageUrl}
          onVideoUpload={handleVideoUpload}
          onExternalVideoAdd={handleExternalVideoAdd}
          videoLoaded={videoLoaded}
          ledMaterialFound={ledMaterialFound}
          videoPlaylist={videoPlaylist}
          activeVideoId={activeVideoId}
          onActivateVideo={handleActivateVideo}
          onRenameClip={handleRenameClip}
          onDeleteClip={handleDeleteClip}
          onReorderPlaylist={handleReorderPlaylist}
          onClearPlaylist={handleClearPlaylist}
          isPlaying={isPlaying}
          isLooping={isLooping}
          onPlay={handlePlay}
          onPause={handlePause}
          onToggleLoop={handleToggleLoop}
          // ── Virtual Camera ────────────────────────────────────────────
          availableCameras={availableCameras}
          selectedCameraId={selectedCameraId}
          onCameraSelect={setSelectedCameraId}
          isCameraStreaming={isCameraStreaming}
          onStartCameraStream={handleStartCameraStream}
          onStopCameraStream={handleStopCameraStream}
          sunAzimuth={sunAzimuth}       onSunAzimuthChange={setSunAzimuth}
          sunElevation={sunElevation}   onSunElevationChange={setSunElevation}
          sunIntensity={sunIntensity}   onSunIntensityChange={setSunIntensity}
          gridCellSize={gridCellSize}   onGridCellSizeChange={setGridCellSize}
          cameraPresets={cameraPresets}
          onSaveView={handleSaveView}
          onGoToView={handleGoToView}
          onDeletePreset={handleDeletePreset}
          autoplayIntervalSeconds={autoplayIntervalSeconds}
          onAutoplayIntervalChange={setAutoplayIntervalSeconds}
          cameraFlyDurationSeconds={cameraFlyDurationSeconds}
          onCameraFlyDurationChange={setCameraFlyDurationSeconds}
          onSaveAutoplayConfig={handleSaveAutoplayConfig}
          onPublish={handlePublish}
          canPublish={canPublish}
          isPublishing={isPublishing}
          publishStatus={publishStatus}
          publishError={publishError}
          publishedId={publishedId}
          projectName={projectName}
          onProjectNameChange={setProjectName}
          versionStatus={versionStatus}
          onVersionStatusChange={setVersionStatus}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          onCloneAsNewRound={handleCloneAsNewRound}
          cloneToast={cloneToast}
          hdriPreset={hdriPreset}          onHdriPresetChange={setHdriPreset}
          hdriLoading={hdriLoading}
          hdriError={hdriError}
          customHdriUrl={customHdriUrl}
          onCustomHdriUpload={handleCustomHdriUpload}
          hasLocalHdri={hasLocalHdri}
          hasCloudHdri={hasCloudHdri}
          isUploadingHdri={isUploadingHdri}
          onUploadHdriToCloud={handleUploadHdriToCloud}
          onClearHdri={handleClearHdri}
          onClearAllHdri={handleClearAllHdri}
          canUploadHdriToCloud={!!(hdriFile && publishedId)}
          onR2MediaUpload={handleR2MediaUpload}
          onR2HdriUpload={handleR2HdriUpload}
          onExternalHdriUrl={handleExternalHdriUrl}
          isR2Uploading={isR2Uploading}
          r2UploadProgress={r2UploadProgress}
          r2Error={r2Error}
          onDismissR2Error={() => setR2Error(null)}
          envIntensity={envIntensity}               onEnvIntensityChange={setEnvIntensity}
          bgBlur={bgBlur}                           onBgBlurChange={setBgBlur}
          showHdriBackground={showHdriBackground}   onShowHdriBackgroundToggle={() => setShowHdriBackground(v => !v)}
          bloomStrength={bloomStrength}    onBloomStrengthChange={setBloomStrength}
          bloomThreshold={bloomThreshold}  onBloomThresholdChange={setBloomThreshold}
          protectLed={protectLed}          onProtectLedToggle={() => setProtectLed(v => !v)}
          transparentLedConfig={transparentLedConfig}
          onTransparentLedConfigChange={setTransparentLedConfig}
        />

        <TopBar role="Admin" color="violet" />
      </StageCanvas>

      <ClientRadarPanel publishedId={publishedId} />

      {isDashboardOpen && (
        <ProjectsDashboard
          onClose={() => setIsDashboardOpen(false)}
          onOpenProject={handleOpenProject}
        />
      )}
      {/* PERSISTENT VIDEO ELEMENT for Virtual Camera - MUST be visible (1px) to prevent Chrome throttling */}
      <video
        ref={cameraVideoRef}
        id="virtual-camera-feed"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: isCameraStreaming ? 120 : 1,  // Show preview when streaming
          height: isCameraStreaming ? 68 : 1,
          opacity: isCameraStreaming ? 0.8 : 0.01,  // Barely visible when not streaming
          pointerEvents: 'none',
          zIndex: 9999,
          borderRadius: 4,
          border: isCameraStreaming ? '2px solid #ff5500' : 'none'
        }}
        playsInline
        muted
        autoPlay
      />

      <GlobalFooter projectName={projectName || 'LIVE STAGE'} />
    </div>
  )
}

const colorMap = {
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  dot: 'bg-violet-400',  text: 'text-violet-300'  },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    dot: 'bg-blue-400',    text: 'text-blue-300'    },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400',   text: 'text-amber-300'   },
}

export function RoleBadge({ role, color = 'violet' }) {
  const c = colorMap[color] || colorMap.violet
  return (
    <div className={`absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full border backdrop-blur-sm ${c.bg} ${c.border} pointer-events-none z-10`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      <span className={`text-xs font-medium tracking-wide ${c.text}`}>{role}</span>
    </div>
  )
}

export default AdminPage

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import StageCanvas from '../components/StageCanvas'
import UIPanel     from '../components/UIPanel'
import TopBar      from '../components/TopBar'
import ProjectsDashboard from '../components/ProjectsDashboard'
import { supabase } from '../lib/supabaseClient'
import useHdriPresets from '../hooks/useHdriPresets'

function AdminPage() {
  // ── Stage model ──────────────────────────────────────────────────────────
  const [stageFile,    setStageFile]    = useState(null)
  const [stageUrl,     setStageUrl]     = useState(null)   // local blob preview
  const [cloudStageUrl, setCloudStageUrl] = useState(null) // already-published URL (skip re-upload)

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

  // ── Publish ──────────────────────────────────────────────────────────────
  const [publishedId,   setPublishedId]   = useState(null)
  const [isPublishing,  setIsPublishing]  = useState(false)
  const [publishStatus, setPublishStatus] = useState(null)  // 'success' | 'error' | null
  const [publishError,  setPublishError]  = useState(null)
  const [projectName,   setProjectName]   = useState('')

  // ── Scene config — environment, HDRI, bloom ──────────────────────────────
  const [hdriPreset,    setHdriPreset]    = useState('none')
  const [hdriFile,      setHdriFile]      = useState(null)
  const [hdriFileExt,   setHdriFileExt]   = useState('hdr')   // 'hdr' | 'exr'
  const [customHdriUrl, setCustomHdriUrl] = useState(null)
  const [hdriLoading,   setHdriLoading]   = useState(false)   // loading lock
  
  // HDRI presets from NAS with validation helpers
  const { presets: hdriPresets } = useHdriPresets()
  const [envIntensity,       setEnvIntensity]       = useState(1)
  const [bgBlur,             setBgBlur]             = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength,      setBloomStrength]      = useState(0.3)

  // ── Visual integrity — bloom threshold, LED color protection ─────────────
  const [bloomThreshold, setBloomThreshold] = useState(1.2)
  const [protectLed,     setProtectLed]     = useState(true)

  // ── HDRI cloud upload ─────────────────────────────────────────────────────
  const [isUploadingHdri, setIsUploadingHdri] = useState(false)

  // ── NAS upload ──────────────────────────────────────────────────────────
  const [isNasUploading, setIsNasUploading] = useState(false)
  const [nasError,       setNasError]       = useState(null)

  // ── Dashboard ────────────────────────────────────────────────────────────
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)

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
        // Request permission first (needed to see device labels)
        await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()))
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices.filter(d => d.kind === 'videoinput')
        setAvailableCameras(cameras)
        console.log('[Camera] Found devices:', cameras.map(c => c.label || c.deviceId))
      } catch (err) {
        console.warn('[Camera] Could not enumerate devices:', err)
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
      v.play().catch(console.error)
      videoRef.current = v
      setVideoElement(v); setVideoLoaded(true)
      setActiveVideoId(id); setIsPlaying(true); setIsLooping(true)
    })
    v.load()
  }, [])

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

  const handlePlay       = useCallback(() => { videoRef.current?.play().catch(console.error); setIsPlaying(true)  }, [])
  const handlePause      = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])
  const handleToggleLoop = useCallback(() => {
    if (videoRef.current) { videoRef.current.loop = !videoRef.current.loop; setIsLooping(videoRef.current.loop) }
  }, [])

  // ── Virtual Camera Handlers (OBS Virtual Cam / NDI) ─────────────────────
  // BULLETPROOF PIPELINE: Multiple fallbacks for virtual camera compatibility
  const handleStartCameraStream = useCallback(async () => {
    if (!selectedCameraId) {
      alert('Please select a camera first')
      return
    }

    // Get the persistent DOM video element (mounted in JSX)
    const video = cameraVideoRef.current
    if (!video) {
      console.error('[Camera] Video element ref not found')
      return
    }

    console.log('[Camera] Starting stream for device:', selectedCameraId)

    try {
      // Cleanup any existing stream
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop())
      }
      video.srcObject = null

      // Get camera stream with relaxed constraints for virtual cameras
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: selectedCameraId }
      })

      console.log('[Camera] Stream obtained, tracks:', stream.getVideoTracks().length)

      // Set stream to persistent DOM element
      video.srcObject = stream

      // Handle device disconnect
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          console.log('[Camera] Device disconnected')
          handleStopCameraStream()
        }
        console.log('[Camera] Track settings:', videoTrack.getSettings())
      }

      // Helper to finalize camera setup
      let finalized = false
      const finalizeCamera = (source) => {
        if (finalized) return
        finalized = true
        console.log('[Camera] ✓ Finalized via:', source)
        console.log('[Camera] Video dimensions:', video.videoWidth, 'x', video.videoHeight)

        // Clear any active playlist video
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ''
        }

        // Pass video to Scene for Three.js VideoTexture
        setVideoElement(video)
        setActiveImageUrl(null)
        setActiveVideoId(null)
        setIsPlaying(false)
        setVideoLoaded(true)
        setCameraStream(stream)
        setIsCameraStreaming(true)
      }

      // Strategy 1: playing event (standard)
      video.addEventListener('playing', () => finalizeCamera('playing event'), { once: true })

      // Strategy 2: loadeddata event (fallback for virtual cameras)
      video.addEventListener('loadeddata', () => {
        if (video.videoWidth > 0) finalizeCamera('loadeddata event')
      }, { once: true })

      // Start playback
      await video.play()
      console.log('[Camera] play() resolved, paused:', video.paused, 'readyState:', video.readyState)

      // Strategy 3: Immediate check after play() (OBS Virtual Camera often works here)
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finalizeCamera('immediate (post-play)')
      }

      // Strategy 4: Polling fallback for stubborn virtual cameras
      let pollCount = 0
      const pollInterval = setInterval(() => {
        pollCount++
        if (finalized) {
          clearInterval(pollInterval)
          return
        }
        if (video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) {
          clearInterval(pollInterval)
          finalizeCamera('polling (attempt ' + pollCount + ')')
        }
        if (pollCount >= 20) { // 2 seconds of polling
          clearInterval(pollInterval)
        }
      }, 100)

      // Final timeout: 5 seconds
      setTimeout(() => {
        if (!finalized && stream.active) {
          console.warn('[Camera] 5s timeout - aborting')
          stream.getTracks().forEach(t => t.stop())
          video.srcObject = null
          alert('Camera stream timed out. The virtual camera may not be outputting frames.')
        }
      }, 5000)

    } catch (err) {
      console.error('[Camera] Error:', err)
      video.srcObject = null
      setCameraStream(null)
      setIsCameraStreaming(false)
      alert('Failed to access camera: ' + err.message)
    }
  }, [selectedCameraId, cameraStream])

  const handleStopCameraStream = useCallback(() => {
    console.log('[Camera] Stopping stream')

    // Stop all tracks
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop()
        console.log('[Camera] Track stopped:', track.kind)
      })
    }

    // Clear the persistent video element (don't remove from DOM)
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause()
      cameraVideoRef.current.srcObject = null
    }

    // Reset state - clear videoElement so Scene removes texture
    setCameraStream(null)
    setIsCameraStreaming(false)
    setVideoElement(null)
    setVideoLoaded(false)

    console.log('[Camera] Cleanup complete')
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
      console.error('HDRI cloud upload error:', err)
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
    console.log('[AdminPage] Clear All HDRI triggered')
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    setCustomHdriUrl(null)
    setHdriFile(null)
    setHdriFileExt('hdr')
    setHdriPreset('none')
    setHdriLoading(false)
  }, [customHdriUrl])

  // Handle HDRI load errors — auto-clear to prevent stuck UI
  const handleHdriLoadError = useCallback((errorMsg) => {
    console.warn('[AdminPage] HDRI load failed:', errorMsg)
    setHdriLoading(false)
    alert(`HDRI load failed: ${errorMsg}\nSwitching to environment OFF.`)
  }, [])

  // ── Shared NAS fetch with timeout + robust error handling ───────────────
  const nasUploadFetch = useCallback(async (file, label) => {
    const NAS_URL = 'https://visual.tooawake.online/upload.php'
    const TIMEOUT = 120_000 // 2 minutes for large files

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_name', projectName.trim())

    let res
    try {
      res = await fetch(NAS_URL, { method: 'POST', body: fd, signal: controller.signal })
    } catch (netErr) {
      if (netErr.name === 'AbortError') throw new Error(`Upload timed out after ${TIMEOUT / 1000}s — is the NAS server online?`)
      throw new Error(`Network error — cannot reach NAS server (${netErr.message}). Check if https://visual.tooawake.online is reachable and CORS is enabled.`)
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`NAS returned HTTP ${res.status}: ${body.slice(0, 200) || 'empty response'}`)
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const body = await res.text().catch(() => '')
      throw new Error(`NAS returned non-JSON (${contentType}). Body: ${body.slice(0, 200)}`)
    }

    const json = await res.json()
    if (!json.success) throw new Error(json.error || json.message || `NAS ${label} failed — server returned success:false`)
    if (!json.url)     throw new Error(`NAS ${label} succeeded but returned no URL`)
    return json
  }, [projectName])

  // ── NAS upload — video / image → Too:Awake NAS server ───────────────────
  const handleNasUpload = useCallback(async (file) => {
    if (!file) return
    if (!projectName.trim()) {
      alert('Vui lòng đặt tên và Save Project trước khi up lên NAS!')
      return
    }
    setIsNasUploading(true); setNasError(null)
    try {
      const json = await nasUploadFetch(file, 'media upload')

      clipCountRef.current += 1
      const id    = Date.now()
      const isImg = file.type.startsWith('image/')
      const name  = file.name.replace(/\.[^/.]+$/, '') || (isImg ? `NAS Image ${clipCountRef.current}` : `NAS Clip ${clipCountRef.current}`)
      const clip  = { id, name, url: json.url, type: isImg ? 'image' : 'video', external: true }
      setVideoPlaylist(prev => [...prev, clip])

      if (isImg) {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
        setVideoElement(null); setActiveImageUrl(json.url)
        setActiveVideoId(id); setVideoLoaded(true); setIsPlaying(false)
      } else {
        setActiveImageUrl(null); activateVideo(id, json.url)
      }
    } catch (err) {
      console.error('NAS upload error:', err)
      setNasError(err.message)
    } finally {
      setIsNasUploading(false)
    }
  }, [projectName, activateVideo, nasUploadFetch])

  // ── NAS upload — HDRI → Too:Awake NAS server ──────────────────────────
  const handleNasHdriUpload = useCallback(async (file) => {
    if (!file) return
    if (!projectName.trim()) {
      alert('Vui lòng đặt tên và Save Project trước khi up lên NAS!')
      return
    }
    setIsNasUploading(true); setNasError(null)
    try {
      const json = await nasUploadFetch(file, 'HDRI upload')

      if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
      }
      setCustomHdriUrl(json.url)
      setHdriFile(null)
      setHdriPreset('none')
    } catch (err) {
      console.error('NAS HDRI upload error:', err)
      setNasError(err.message)
    } finally {
      setIsNasUploading(false)
    }
  }, [projectName, customHdriUrl, nasUploadFetch])

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

  // ── Camera preset helpers ────────────────────────────────────────────────
  const handleSaveView = useCallback((name) => {
    if (!cameraControlsRef.current) return
    const pos = cameraControlsRef.current.getPosition  ? cameraControlsRef.current.getPosition()  : { x:0, y:5, z:10 }
    const tgt = cameraControlsRef.current.getTarget    ? cameraControlsRef.current.getTarget()    : { x:0, y:0, z:0  }
    setCameraPresets(prev => [...prev, { id: Date.now(), name, position: pos, target: tgt }])
  }, [])

  const handleGoToView = useCallback((preset) => {
    cameraControlsRef.current?.setLookAt(
      preset.position.x, preset.position.y, preset.position.z,
      preset.target.x,   preset.target.y,   preset.target.z, true
    )
  }, [])

  const handleDeletePreset = useCallback((id) => {
    setCameraPresets(prev => prev.filter(p => p.id !== id))
  }, [])

  // ── Open project from dashboard ──────────────────────────────────────────
  const handleOpenProject = useCallback((project) => {
    // Revoke existing local blob URLs
    localBlobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch (_) {} })
    localBlobUrlsRef.current = []
    if (stageUrl && stageUrl.startsWith('blob:')) { try { URL.revokeObjectURL(stageUrl) } catch (_) {} }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }

    // Reset all state to match the opened project
    setStageFile(null)
    setStageUrl(project.stage_url || null)
    setCloudStageUrl(project.stage_url || null)
    setVideoElement(null)
    setActiveImageUrl(null)
    setVideoLoaded(false)
    setVideoPlaylist([])
    clipCountRef.current = 0
    setActiveVideoId(null)
    setIsPlaying(false)
    setCameraPresets(project.camera_presets || [])
    setGridCellSize(project.grid_cell_size ?? 1)
    setPublishedId(project.id)
    setProjectName(project.name || '')
    setPublishStatus(null)
    setPublishError(null)
    setIsDashboardOpen(false)

    // Restore scene_config if present — all lighting values for consistency
    const cfg = project.scene_config
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
      setHdriFile(null)

      // ★ Sun lighting - MUST load these for consistency with Client/Collab
      if (cfg.sunIntensity != null)  setSunIntensity(cfg.sunIntensity)
      if (cfg.sunAzimuth != null)    setSunAzimuth(cfg.sunAzimuth)
      if (cfg.sunElevation != null)  setSunElevation(cfg.sunElevation)

      // HDRI URL
      if (cfg.customHdriUrl) {
        console.log('[AdminPage] Loading saved HDRI URL:', cfg.customHdriUrl)
        setCustomHdriUrl(cfg.customHdriUrl)
      } else {
        setCustomHdriUrl(null)
      }
    }

    // Restore full media playlist, or fall back to legacy single video_url
    if (project.media_playlist && project.media_playlist.length > 0) {
      const restored = project.media_playlist.map((item, i) => ({
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
    } else if (project.video_url) {
      const id = Date.now()
      clipCountRef.current = 1
      const clip = { id, name: 'Cloud Video', url: project.video_url, type: 'video', external: true }
      setVideoPlaylist([clip])
      activateVideo(id, project.video_url)
    }
  }, [stageUrl, activateVideo])

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
        const stagePath = `${projectId}/stage.glb`
        const { error: stageErr } = await supabase.storage.from('projects').upload(stagePath, stageFile, { upsert: true })
        if (stageErr) throw new Error(`Stage upload failed: ${stageErr.message}`)
        const { data: stagePublic } = supabase.storage.from('projects').getPublicUrl(stagePath)
        finalStageUrl = stagePublic.publicUrl
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
        // ★ Sun lighting - save all values for Client/Collab consistency
        sunPosition:         [d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az)],
        sunIntensity:        sunIntensity,
        sunAzimuth:          sunAzimuth,
        sunElevation:        sunElevation,
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
      console.error('Publish error:', err)
      setPublishStatus('error')
      setPublishError(err.message || 'Unknown error')
    } finally {
      setIsPublishing(false)
    }
  }, [stageFile, cloudStageUrl, publishedId, videoPlaylist, activeVideoId, cameraPresets, gridCellSize, projectName,
      hdriPreset, customHdriUrl, envIntensity, bgBlur, showHdriBackground, bloomStrength, sunAzimuth, sunElevation,
      bloomThreshold, protectLed])

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
      >
        <UIPanel
          onModelUpload={handleModelUpload}
          onVideoUpload={handleVideoUpload}
          onExternalVideoAdd={handleExternalVideoAdd}
          videoLoaded={videoLoaded}
          ledMaterialFound={ledMaterialFound}
          videoPlaylist={videoPlaylist}
          activeVideoId={activeVideoId}
          onActivateVideo={handleActivateVideo}
          onRenameClip={handleRenameClip}
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
          onPublish={handlePublish}
          canPublish={canPublish}
          isPublishing={isPublishing}
          publishStatus={publishStatus}
          publishError={publishError}
          publishedId={publishedId}
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          hdriPreset={hdriPreset}          onHdriPresetChange={setHdriPreset}
          hdriLoading={hdriLoading}
          customHdriUrl={customHdriUrl}
          onCustomHdriUpload={handleCustomHdriUpload}
          hasLocalHdri={hasLocalHdri}
          hasCloudHdri={hasCloudHdri}
          isUploadingHdri={isUploadingHdri}
          onUploadHdriToCloud={handleUploadHdriToCloud}
          onClearHdri={handleClearHdri}
          onClearAllHdri={handleClearAllHdri}
          canUploadHdriToCloud={!!(hdriFile && publishedId)}
          onNasUpload={handleNasUpload}
          onNasHdriUpload={handleNasHdriUpload}
          onExternalHdriUrl={handleExternalHdriUrl}
          isNasUploading={isNasUploading}
          nasError={nasError}
          onDismissNasError={() => setNasError(null)}
          envIntensity={envIntensity}               onEnvIntensityChange={setEnvIntensity}
          bgBlur={bgBlur}                           onBgBlurChange={setBgBlur}
          showHdriBackground={showHdriBackground}   onShowHdriBackgroundToggle={() => setShowHdriBackground(v => !v)}
          bloomStrength={bloomStrength}    onBloomStrengthChange={setBloomStrength}
          bloomThreshold={bloomThreshold}  onBloomThresholdChange={setBloomThreshold}
          protectLed={protectLed}          onProtectLedToggle={() => setProtectLed(v => !v)}
        />

        <TopBar role="Admin" color="violet" />
      </StageCanvas>

      {isDashboardOpen && (
        <ProjectsDashboard
          onClose={() => setIsDashboardOpen(false)}
          onOpenProject={handleOpenProject}
        />
      )}
      {/* PERSISTENT HIDDEN VIDEO ELEMENT for Virtual Camera (Chrome anti-throttling) */}
      <video
        ref={cameraVideoRef}
        id="virtual-camera-feed"
        style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, pointerEvents: 'none' }}
        playsInline
        muted
        autoPlay
      />
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

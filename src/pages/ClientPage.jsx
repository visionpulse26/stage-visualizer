import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import { useSecurityLockdown } from '../hooks/useSecurityLockdown'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import { useStageLoading } from '../hooks/useStageLoading'
import { useBlobUrlCache } from '../hooks/useBlobUrlCache'
import { useProjectStats } from '../hooks/useProjectStats'
import { recordClientPageView, recordClientInteraction } from '../lib/analyticsTracker'
import { useClientSessionTracking } from '../hooks/useClientSessionTracking'
import { supabase } from '../lib/supabaseClient'
import { clearMemCache, fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { deleteFeedback, loadPublishedVersion, loadVersionById, submitFeedback, loadFeedback, updateFeedback, hydrateSnapshot } from '../lib/presentationVersions'
import { getPresignedUploadUrl, uploadFileToPresignedUrl } from '../utils/r2Upload'
import { FeedbackDraftPanel, AnnotationLayer, AnnotationToolbar, FeedbackTopBar, FeedbackLockBanner, StageLockBanner, StageLockBadge } from '../components/FeedbackDraftPanel'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        '#080604',
  glass:     'rgba(255,255,255,0.045)',
  glass2:    'rgba(255,255,255,0.07)',
  glassDark: 'rgba(8,6,4,0.75)',
  border:    'rgba(220,100,30,0.20)',
  border2:   'rgba(220,100,30,0.32)',
  ember:     '#E8531A',
  ember2:    '#FF6B2B',
  emberDim:  'rgba(232,83,26,0.15)',
  emberGlow: '0 0 14px rgba(232,83,26,0.45), 0 0 2px rgba(232,83,26,0.8)',
  cam:       '#1FA0EE',
  camDim:    'rgba(31,160,238,0.15)',
  camGlow:   '0 0 10px rgba(31,160,238,0.35)',
  green:     '#2BC782',
  amber:     '#E89518',
  text:      '#F4ECE2',
  text2:     '#C8B8A8',
  text3:     '#8E7E70',
  text4:     '#5A4E45',
}

// ── Layout helpers ────────────────────────────────────────────────────────────
const Row = ({ children, gap = 6, align = 'center', style = {} }) => (
  <div style={{ display: 'flex', alignItems: align, gap, ...style }}>{children}</div>
)
const Col = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
)
const Spacer = () => <div style={{ flex: 1 }} />

// ── Client zoom guard ─────────────────────────────────────────────────────────
// Prevents client from zooming in too close (hides model defects / LED artifacts)
// and too far (loses stage context). Values are in world units; scale roughly
// with model size — CameraAutoFrame already sets a good default framing.
const CLIENT_MIN_DISTANCE = 8    // cannot get closer than this
const CLIENT_MAX_DISTANCE = 220  // cannot zoom out further than this
const isRemoteUrl = (url) => !!url && (url.startsWith('http://') || url.startsWith('https://'))

// ── ClientPage ────────────────────────────────────────────────────────────────
function ClientPage() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const previewVersionId = searchParams.get('versionId')
  useSecurityLockdown()

  const { loadingManager, progress, status, loaded: stageLoaded, reset: resetStageLoading } = useStageLoading()

  // ── Stage state ───────────────────────────────────────────────────────────
  const [modelUrl,         setModelUrl]         = useState(null)
  const [videoElement,     setVideoElement]     = useState(null)
  const [activeImageUrl,   setActiveImageUrl]   = useState(null)
  const [videoLoaded,      setVideoLoaded]      = useState(false)
  const [isDbLoading,      setIsDbLoading]      = useState(true)
  const [projectNotFound,  setProjectNotFound]  = useState(false)
  const [clientLocked,     setClientLocked]     = useState(false)
  const [projectName,      setProjectName]      = useState('LIVE STAGE')
  const [versionStatus,    setVersionStatus]    = useState('')

  const [cameraPresets,    setCameraPresets]    = useState([])
  const [activePresetId,   setActivePresetId]   = useState(null)
  const cameraControlsRef      = useRef(null)
  const cameraTargetPresetRef  = useRef(null)
  const [cameraFlyDurationSeconds, setCameraFlyDurationSeconds] = useState(4)

  const [gridCellSize,     setGridCellSize]     = useState(1)
  const [hdriPreset,       setHdriPreset]       = useState('none')
  const [customHdriUrl,    setCustomHdriUrl]    = useState(null)
  const [hdriFileExt,      setHdriFileExt]      = useState('hdr')
  const [envIntensity,     setEnvIntensity]     = useState(1)
  const [bgBlur,           setBgBlur]           = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength,    setBloomStrength]    = useState(0.3)
  const [bloomThreshold,   setBloomThreshold]   = useState(1.2)
  const [protectLed,       setProtectLed]       = useState(true)
  const [transparentLedConfig, setTransparentLedConfig] = useState({
    enabled: true, gridDensity: 36, gridDensityX: 36, gridDensityY: 36,
    barThickness: 0.08, barThicknessX: 0.08, barThicknessY: 0.08, glow: 1.4, opacity: 0.95,
  })
  const [sunPosition,   setSunPosition]   = useState([10.6, 10.6, 7.5])
  const [sunIntensity,  setSunIntensity]  = useState(1)

  // ── Playlist / video ──────────────────────────────────────────────────────
  const [videoPlaylist, setVideoPlaylist] = useState([])
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [currentTime,   setCurrentTime]   = useState(0)
  const [activeDuration, setActiveDuration] = useState(0)
  const [isSwitchingClip, setIsSwitchingClip] = useState(false)
  const [clipTransitionName, setClipTransitionName] = useState('')
  const videoRef = useRef(null)
  const activationSeqRef = useRef(0)

  // ── Presentation snapshot ─────────────────────────────────────────────────
  const [presentationSlides,   setPresentationSlides]   = useState([])  // from snapshot_json
  const [publishedVersion,     setPublishedVersion]     = useState(null)
  const [previewVersion,       setPreviewVersion]       = useState(null)
  const [activeSlideId,        setActiveSlideId]        = useState(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [contextCollapsed, setContextCollapsed] = useState(false)

  // ── Feedback mode state ───────────────────────────────────────────────────
  const [feedbackMode,  setFeedbackMode]  = useState(false)
  const [lockedCtx,     setLockedCtx]     = useState(null)   // { slideTitle, camName, clipTime, versionLabel }
  const [reviewerName,  setReviewerName]  = useState('')
  const [reviewerNameLocked, setReviewerNameLocked] = useState(false)
  const [comment,       setComment]       = useState('')
  const [annotation,    setAnnotation]    = useState(null)
  const [annotTool,     setAnnotTool]     = useState(null)
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [submitError,   setSubmitError]   = useState(null)
  const [prevFeedback,  setPrevFeedback]  = useState([])
  const [slideFeedback, setSlideFeedback] = useState([])

  // ── Note focus mode (click director note with annotation) ────────────────
  const [noteFocusNote, setNoteFocusNote] = useState(null)   // DirectorNote | null

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [activeDrawerTab, setActiveDrawerTab] = useState(null)
  const isPreviewingVersion = Boolean(previewVersion)

  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()
  useProjectStats(projectId, 'client')
  const { startClipWatch } = useClientSessionTracking(projectId)
  const currentCameraRef = useRef(null)
  const stageViewportRef = useRef(null)
  const LS_NAME_KEY = `stageviz:reviewer-name:${projectId}`

  // Load persisted reviewer name
  useEffect(() => {
    const saved = localStorage.getItem(LS_NAME_KEY)
    if (saved) {
      setReviewerName(saved)
      setReviewerNameLocked(true)
    } else {
      setReviewerNameLocked(false)
    }
  }, [LS_NAME_KEY])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const sceneReady = !isDbLoading && !!modelUrl && stageLoaded

  // Active slide — from snapshot if published, otherwise wrap the active raw clip
  const activeSlide = useMemo(() => {
    if (presentationSlides.length > 0) {
      return presentationSlides.find(s => s.id === activeSlideId) ?? presentationSlides[0] ?? null
    }
    // No published snapshot — synthesise a minimal slide from the active playlist clip
    const clip = videoPlaylist.find(c => c.id === activeVideoId) ?? videoPlaylist[0]
    return clip ? rawToSlide(clip, videoPlaylist.indexOf(clip)) : null
  }, [presentationSlides, activeSlideId, videoPlaylist, activeVideoId])

  const refreshSlideFeedback = useCallback(async (slideId = activeSlide?.id) => {
    if (!projectId || !slideId) {
      setSlideFeedback([])
      return []
    }
    try {
      const items = await loadFeedback(projectId, {
        slideId,
        versionId: publishedVersion?.id,
      })
      setSlideFeedback(items)
      return items
    } catch {
      setSlideFeedback([])
      return []
    }
  }, [activeSlide?.id, projectId, publishedVersion?.id])

  useEffect(() => {
    refreshSlideFeedback(activeSlide?.id)
  }, [activeSlide?.id, refreshSlideFeedback])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
  }, [])

  useEffect(() => { resetStageLoading() }, [projectId, resetStageLoading])

  // ── Video activation ──────────────────────────────────────────────────────
  const resolvePlayableUrl = useCallback(async (clip) => {
    if (!clip?.url || !isRemoteUrl(clip.url)) return clip?.url
    const blobUrl = await fetchAsBlobUrlWithCache(clip.url)
    addBlob(blobUrl)
    return blobUrl
  }, [addBlob])

  const activateVideo = useCallback((id, url, activationSeq) => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    const v = document.createElement('video')
    setIsSwitchingClip(true)
    setCurrentTime(0)
    setActiveDuration(0)
    setVideoLoaded(false)

    const onLoaded = () => {
      if (activationSeq && activationSeq !== activationSeqRef.current) return
      const duration = Number.isFinite(v.duration) ? v.duration : 0
      videoRef.current = v
      setActiveDuration(duration)
      setVideoElement(v)
      setActiveVideoId(id)
      setVideoLoaded(true)
      setIsSwitchingClip(false)
      v.play().catch(() => {})
      setIsPlaying(true)
    }

    const onError = () => {
      if (activationSeq && activationSeq !== activationSeqRef.current) return
      setVideoLoaded(false)
      setIsPlaying(false)
      setIsSwitchingClip(false)
    }

    v.onloadeddata = onLoaded
    v.onerror = onError
    v.ontimeupdate = () => setCurrentTime(v.currentTime || 0)
    v.ondurationchange = () => setActiveDuration(Number.isFinite(v.duration) ? v.duration : 0)
    v.onended = () => setIsPlaying(false)

    v.src = url
    v.crossOrigin = 'anonymous'
    v.loop = true
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.load()
  }, [])

  const activateClip = useCallback(async (clip, { track = true, slideId = null } = {}) => {
    if (!clip) return
    const activationSeq = ++activationSeqRef.current
    if (track) recordClientInteraction(projectId, 'clip_play', clip?.name || 'Unknown')
    startClipWatch?.(clip?.name || 'Unknown')
    setClipTransitionName(clip?.name || 'Next visual')
    setIsSwitchingClip(true)
    setVideoLoaded(false)
    setCurrentTime(0)
    setActiveDuration(0)

    let url = clip.url
    try {
      url = await resolvePlayableUrl(clip)
    } catch {
      url = clip.url
    }
    if (activationSeq !== activationSeqRef.current) return

    if (slideId != null) setActiveSlideId(slideId)

    if (clip.type === 'image') {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current = null
      }
      setVideoElement(null)
      setActiveImageUrl(url)
      setActiveVideoId(clip.id)
      setIsPlaying(false)
      return
    }

    setActiveImageUrl(null)
    activateVideo(clip.id, url, activationSeq)
  }, [activateVideo, projectId, resolvePlayableUrl, startClipWatch])

  // ── Load project ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function fetchProject() {
      activationSeqRef.current += 1
      revokeAllBlobs()
      clearMemCache()
      setIsDbLoading(true); setProjectNotFound(false)
      setVideoPlaylist([])
      setActiveVideoId(null)
      setActiveImageUrl(null)
      setVideoElement(null)
      setVideoLoaded(false)
      setIsPlaying(false)
      setIsSwitchingClip(false)
      setClipTransitionName('')
      setPresentationSlides([])
      setPublishedVersion(null)
      setPreviewVersion(null)
      setActiveSlideId(null)
      setSlideFeedback([])

      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (cancelled) return
        if (error || !data) { setProjectNotFound(true); return }

        // Client lock check
        if (data.is_client_locked) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) { setClientLocked(true); setIsDbLoading(false); return }
        }
        setClientLocked(false)
        recordClientPageView(projectId)

        // Model
        setModelUrl(data.stage_url || null)

        // Try to load a presentation snapshot first. versionId previews are
        // admin-only; anonymous users always fall back to the live published row.
        let snapshotSlides = []
        try {
          let pv = null
          if (previewVersionId) {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              const preview = await loadVersionById(previewVersionId)
              if (preview?.project_id === projectId) {
                pv = preview
                setPreviewVersion(preview)
              }
            }
          }
          if (!pv) pv = await loadPublishedVersion(projectId)
          if (!cancelled && pv?.snapshot_json?.slides?.length) {
            setPublishedVersion(pv)
            const hydratedSnap = hydrateSnapshot(pv.snapshot_json)
            snapshotSlides = hydratedSnap.slides.filter(s => !s.hiddenFromClient)
            setPresentationSlides(snapshotSlides)
            if (snapshotSlides[0]) setActiveSlideId(snapshotSlides[0].id)
            // Override camera presets from snapshot if available
            if (hydratedSnap.cameraPresets?.length) {
              setCameraPresets(hydratedSnap.cameraPresets)
            }
          }
        } catch {
          // No published version yet — fall through to raw playlist
        }

        // Load media playlist (blob URLs)
        const restoreMediaPlaylist = (items) => (items || []).map((item, i) => ({
          ...item,
          id: item.id ?? item.name ?? `clip_${i}`,
          name: item.name,
          url: item.url,
          type: item.type,
        }))

        if (data.media_playlist?.length) {
          const restored = restoreMediaPlaylist(data.media_playlist)
          if (!cancelled) {
            setVideoPlaylist(restored)
            const first = restored[0]
            if (first) activateClip(first, { track: false, slideId: snapshotSlides[0]?.id ?? null })
          }
        } else if (data.video_url) {
          const id = 'published_video'
          const clip = { id, name: 'Published Video', type: 'video', url: data.video_url }
          setVideoPlaylist([clip])
          activateClip(clip, { track: false, slideId: snapshotSlides[0]?.id ?? null })
        }

        // Camera presets (fallback if snapshot didn't override)
        if (!snapshotSlides.length && data.camera_presets) {
          setCameraPresets(data.camera_presets)
        } else if (!snapshotSlides.length) {
          setCameraPresets(data.camera_presets || [])
        }

        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)
        setProjectName(data.name || 'LIVE STAGE')

        // Scene config
        const cfg = data.scene_config
        if (cfg) {
          setHdriPreset(cfg.hdriPreset ?? 'none')
          setEnvIntensity(cfg.envIntensity ?? 1)
          setBgBlur(cfg.bgBlur ?? 0)
          setShowHdriBackground(cfg.showHdriBackground ?? false)
          setBloomStrength(cfg.bloomStrength ?? 0.3)
          setBloomThreshold(cfg.bloomThreshold ?? 1.2)
          setProtectLed(cfg.protectLed ?? true)
          setTransparentLedConfig(prev => ({ ...prev, ...(cfg.transparentLedConfig || cfg.transparentLed || {}) }))
          if (cfg.sunPosition?.length) setSunPosition(cfg.sunPosition)
          if (cfg.sunIntensity != null) setSunIntensity(cfg.sunIntensity)
          if (cfg.cameraFlyDurationSeconds != null) setCameraFlyDurationSeconds(cfg.cameraFlyDurationSeconds)
          if (cfg.versionStatus != null) setVersionStatus(cfg.versionStatus)
          if (cfg.customHdriUrl) {
            const hdriSrc = cfg.customHdriUrl.replace('visual.tooawake.online', 'visual.tooawake.mov')
            const ext = (hdriSrc.split('?')[0].split('.').pop() || 'hdr').toLowerCase()
            setHdriFileExt(['hdr', 'exr'].includes(ext) ? ext : 'hdr')
            if (isRemoteUrl(hdriSrc)) {
              fetchAsBlobUrlWithCache(hdriSrc)
                .then(b => { if (!cancelled) { addBlob(b); setCustomHdriUrl(b) } })
                .catch(() => { if (!cancelled) setCustomHdriUrl(hdriSrc) })
            } else {
              setCustomHdriUrl(hdriSrc)
            }
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
  }, [projectId, previewVersionId, activateClip, addBlob, revokeAllBlobs])

  // ── Apply client zoom guard once stage is ready ───────────────────────────
  useEffect(() => {
    if (!sceneReady) return
    const controls = cameraControlsRef?.current
    if (!controls) return
    controls.minDistance = CLIENT_MIN_DISTANCE
    controls.maxDistance = CLIENT_MAX_DISTANCE
  }, [sceneReady])

  useEffect(() => {
    const controls = cameraControlsRef.current
    if (!controls) return
    const onControlStart = () => {
      if (!feedbackMode) setActivePresetId(null)
    }
    controls.addEventListener?.('controlstart', onControlStart)
    return () => controls.removeEventListener?.('controlstart', onControlStart)
  }, [feedbackMode])

  // ── Exit note focus mode on drag / scroll ─────────────────────────────────
  useEffect(() => {
    if (!noteFocusNote) return
    const el = stageViewportRef.current
    if (!el) return
    let startX = null, startY = null
    const onPointerDown = (e) => { startX = e.clientX; startY = e.clientY }
    const onPointerMove = (e) => {
      if (startX == null) return
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) exitNoteFocusMode()
    }
    const onWheel = () => exitNoteFocusMode()
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('wheel', onWheel)
    }
  }, [noteFocusNote, exitNoteFocusMode])

  // ── Activate slide → switch clip + camera ─────────────────────────────────
  const activateSlide = useCallback((slideId) => {
    const slide = presentationSlides.find(s => s.id === slideId)
    setActiveSlideId(slideId)
    if (!slide) return

    // Switch clip
    const slideIndex = presentationSlides.findIndex(s => s.id === slideId)
    const clip = videoPlaylist.find(c =>
      String(c.id) === String(slide.clipId) || c.name === slide.clipId
    ) ?? videoPlaylist[slideIndex]

    if (clip) {
      activateClip(clip, { slideId })
    }

    // Switch default camera
    if (slide.defaultCameraPresetId) {
      const preset = findPreset(cameraPresets, slide.defaultCameraPresetId)
      if (preset) {
        setActivePresetId(preset.id)
        setCameraTargetPreset(cameraTargetPresetRef, preset)
        currentCameraRef.current = preset.name || String(preset.id)
        recordClientInteraction(projectId, 'camera_change', preset.name || String(preset.id))
      }
    }
  }, [activateClip, cameraPresets, presentationSlides, videoPlaylist, projectId])

  // If no presentation snapshot, fall back to raw playlist clip switching
  const activateRawClip = useCallback((clip) => {
    activateClip(clip)
  }, [activateClip])

  const handlePlay  = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true) }, [])
  const handlePause = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])

  const handleStageScreenshot = useCallback(() => {
    const stageEl = stageViewportRef.current
    const canvas = stageEl?.querySelector('canvas')
    if (!stageEl || !canvas) return

    recordClientInteraction(projectId, 'screenshot', currentCameraRef.current || 'Current View')

    const rawClip = videoPlaylist.find(c => c.id === activeVideoId)
    const title = activeSlide?.title || rawClip?.name || ''
    const dataUrl = captureClientStagePanel(canvas, {
      title,
      projectName,
      includeTitle: !feedbackMode && !!title,
      includeFooter: !feedbackMode,
    })

    const safeName = (title || projectName || projectId || 'stage').replace(/[^a-z0-9_-]+/gi, '_')
    const a = document.createElement('a')
    a.download = `StageViz_${safeName}.png`
    a.href = dataUrl
    a.click()
  }, [activeSlide?.title, activeVideoId, feedbackMode, projectId, projectName, videoPlaylist])

  const handleImageTextureLoaded = useCallback(() => {
    setVideoLoaded(true)
    setIsSwitchingClip(false)
  }, [])

  // ── Feedback mode ─────────────────────────────────────────────────────────
  const enterFeedbackMode = useCallback(async () => {
    if (isPreviewingVersion) return
    const centerPreset = findPresetByName(cameraPresets, 'center')
    const selectedPreset = centerPreset ?? findPreset(cameraPresets, activePresetId)
    if (selectedPreset) {
      setActivePresetId(selectedPreset.id)
      const controls = cameraControlsRef.current
      if (controls && selectedPreset.position && selectedPreset.target) {
        controls.setLookAt(
          selectedPreset.position.x,
          selectedPreset.position.y,
          selectedPreset.position.z,
          selectedPreset.target.x,
          selectedPreset.target.y,
          selectedPreset.target.z,
          false
        )
        controls.update(0)
      }
      setCameraTargetPreset(cameraTargetPresetRef, selectedPreset)
    }

    // Pause video and lock camera controls
    videoRef.current?.pause()
    setIsPlaying(false)
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = false

    const clipTime = videoRef.current?.currentTime ?? 0
    const camPreset = selectedPreset ?? findPreset(cameraPresets, activePresetId)
    const vLabel = publishedVersion ? `v${publishedVersion.version_number}` : null

    setLockedCtx({
      slideTitle:   activeSlide?.title ?? null,
      camName:      camPreset?.name ?? null,
      clipTime,
      versionLabel: vLabel,
    })
    setNoteFocusNote(null)
    setAnnotation(null)
    setAnnotTool(null)
    setComment('')
    setSubmitError(null)
    setFeedbackMode(true)

    // Load previous feedback for this slide
    const items = slideFeedback.length ? slideFeedback : await refreshSlideFeedback(activeSlide?.id)
    setPrevFeedback(items)
  }, [activePresetId, activeSlide, cameraPresets, isPreviewingVersion, projectId, publishedVersion, refreshSlideFeedback, slideFeedback])

  const exitFeedbackMode = useCallback(() => {
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = true
    setFeedbackMode(false)
    setLockedCtx(null)
    setAnnotation(null)
    setAnnotTool(null)
    setComment('')
    setSubmitError(null)
  }, [])

  const enterNoteFocusMode = useCallback((note) => {
    if (!note?.annotation) return
    // Exit feedback mode first if active
    if (feedbackMode) exitFeedbackMode()
    const centerPreset = cameraPresets.find(p => p.name?.toLowerCase() === 'center')
    const preset = centerPreset ?? cameraPresets.find(p => p.id === note.cameraPresetId)
    if (preset) {
      setActivePresetId(preset.id)
      setCameraTargetPreset(cameraTargetPresetRef, preset)
    }
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = false
    if (note.clipTimeSeconds != null && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = Math.min(note.clipTimeSeconds, videoRef.current.duration || 0)
      setIsPlaying(false)
    }
    setNoteFocusNote(note)
  }, [cameraPresets, feedbackMode, exitFeedbackMode])

  const exitNoteFocusMode = useCallback(() => {
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = true
    setNoteFocusNote(null)
  }, [])

  const handleSubmitFeedback = useCallback(async (draft = {}) => {
    if (isPreviewingVersion) return
    const draftReviewerName = (draft.reviewerName ?? reviewerName).trim()
    const draftComment = (draft.comment ?? comment).trim()
    if (!draftReviewerName || !draftComment) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const canvas = stageViewportRef.current?.querySelector('canvas')
      const snapshot = annotation && canvas
        ? await captureFeedbackSnapshot(canvas, { projectId, slideId: activeSlide?.id })
        : null
      const annotationPayload = annotation ? { ...annotation, snapshot } : null

      await submitFeedback({
        project_id:              projectId,
        presentation_version_id: publishedVersion?.id ?? null,
        slide_id:                activeSlide?.id ?? null,
        clip_id:                 activeSlide?.clipId ?? null,
        clip_time_seconds:       lockedCtx?.clipTime ?? null,
        camera_snapshot_json:    lockedCtx?.camName ? { name: lockedCtx.camName } : null,
        annotation_json:         annotationPayload,
        reviewer_name:           draftReviewerName,
        comment:                 draftComment,
        status:                  'pending',
      })
      localStorage.setItem(LS_NAME_KEY, draftReviewerName)
      setReviewerName(draftReviewerName)
      setReviewerNameLocked(true)
      await refreshSlideFeedback(activeSlide?.id)
      exitFeedbackMode()
    } catch (err) {
      const msg = String(err?.message ?? '')
      if (msg.includes("Could not find the table 'public.client_feedback_items'")) {
        setSubmitError("Feedback table missing. Run `supabase/presentation_versions_schema.sql` on this Supabase project.")
      } else {
        setSubmitError(msg || 'Failed to submit. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [reviewerName, comment, projectId, publishedVersion, activeSlide, lockedCtx, annotation, LS_NAME_KEY, refreshSlideFeedback, exitFeedbackMode, isPreviewingVersion])

  const handleUpdateClientFeedback = useCallback(async (item, patch) => {
    if (isPreviewingVersion) return
    const nextComment = patch.comment?.trim()
    if (!item?.id || !nextComment) return
    setSubmitError(null)
    try {
      const updated = await updateFeedback(item.id, { comment: nextComment })
      setPrevFeedback(prev => prev.map(f => f.id === item.id ? { ...f, ...updated } : f))
      setSlideFeedback(prev => prev.map(f => f.id === item.id ? { ...f, ...updated } : f))
    } catch (err) {
      setSubmitError(err?.message || 'Failed to update feedback.')
      throw err
    }
  }, [isPreviewingVersion])

  const handleDeleteClientFeedback = useCallback(async (item) => {
    if (isPreviewingVersion) return
    if (!item?.id) return
    const label = item.comment ? `"${item.comment.slice(0, 80)}${item.comment.length > 80 ? '...' : ''}"` : 'this feedback'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setSubmitError(null)
    try {
      await deleteFeedback(item.id)
      setPrevFeedback(prev => prev.filter(f => f.id !== item.id))
      setSlideFeedback(prev => prev.filter(f => f.id !== item.id))
    } catch (err) {
      setSubmitError(err?.message || 'Failed to delete feedback.')
      throw err
    }
  }, [isPreviewingVersion])

  const handleHdriLoadError  = useCallback(() => {}, [])
  const handleClearAllHdri   = useCallback(() => { setCustomHdriUrl(null); setHdriPreset('none') }, [])

  // ── Early exits ───────────────────────────────────────────────────────────
  if (projectNotFound) return <ClientProjectNotFound projectId={projectId} />
  if (clientLocked)    return <ClientLinkLocked />

  // ── Derived display values ────────────────────────────────────────────────
  const hasSnapshot   = presentationSlides.length > 0
  const displayClips  = hasSnapshot ? presentationSlides : videoPlaylist.map(rawToSlide)
  const activeClipRaw = videoPlaylist.find(c => c.id === activeVideoId)

  const vBadge = publishedVersion
    ? `v${publishedVersion.version_number}${isPreviewingVersion ? ` ${publishedVersion.status}` : ''}`
    : (versionStatus || null)

  // ── Mobile render ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        width: '100%', height: '100svh', background: T.bg, color: T.text,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
      }}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

        <BrandedLoadingScreen isLoaded={sceneReady} progress={progress} status={status} />

        <MobileTopBar projectName={projectName} versionBadge={vBadge} />
        {isPreviewingVersion && <VersionPreviewBanner version={previewVersion} />}

        <div ref={stageViewportRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
            onHdriLoading={() => {}}
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
            freezeRenderLoop={false}
          />
          {activeSlide?.title && <StageTitleBadge title={activeSlide.title} />}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 36, background: 'rgba(5,4,3,0.92)', borderTop: `1px solid rgba(220,100,30,0.12)`,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
          }}>
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              style={{ background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontSize: 13 }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
              <div style={{ width: `${activeDuration > 0 ? Math.min(100, (currentTime / activeDuration) * 100) : 0}%`, height: '100%', background: T.ember, borderRadius: 2 }} />
            </div>
          </div>
          <NextSceneLoadingPopup show={sceneReady && isSwitchingClip} clipName={clipTransitionName} />
        </div>

        <MobileBottomTabBar
          activeTab={activeDrawerTab}
          onTabChange={(tab) => setActiveDrawerTab(prev => prev === tab ? null : tab)}
          clipCount={displayClips.length}
          feedbackCount={slideFeedback.length}
          refCount={(activeSlide?.references ?? []).filter(r => r.visibleToClient).length}
        />

        {activeDrawerTab && (
          <MobileDrawer
            onClose={() => setActiveDrawerTab(null)}
            title={activeDrawerTab === 'clips' ? 'Scenes' : activeDrawerTab === 'context' ? 'Context' : 'References'}
          >
            {activeDrawerTab === 'clips' && (
              <MobileClipList
                clips={displayClips}
                activeId={activeSlide?.id ?? null}
                onSelect={(id) => {
                  if (hasSnapshot) activateSlide(id)
                  else { const c = videoPlaylist.find(v => String(v.id) === String(id)); if (c) activateRawClip(c) }
                  setActiveDrawerTab(null)
                }}
              />
            )}
            {activeDrawerTab === 'context' && (
              <MobileContextContent slide={activeSlide} feedbackItems={slideFeedback} />
            )}
            {activeDrawerTab === 'refs' && (
              <MobileReferencesContent slide={activeSlide} />
            )}
          </MobileDrawer>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%', height: '100vh', background: T.bg, color: T.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Radial ambient */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 40% at 15% 100%, rgba(180,50,10,0.1) 0%, transparent 60%)',
      }} />

      <BrandedLoadingScreen isLoaded={sceneReady} progress={progress} status={status} />

      {/* ── Top bar ── */}
      {feedbackMode ? (
        <FeedbackTopBar lockedCtx={lockedCtx} onCancel={exitFeedbackMode} />
      ) : noteFocusNote ? (
        <NoteFocusTopBar
          note={noteFocusNote}
          slideTitle={activeSlide?.title ?? ''}
          onExit={exitNoteFocusMode}
        />
      ) : (
          <ClientTopBar
            projectName={projectName}
            versionBadge={vBadge}
            publishedAt={publishedVersion?.published_at}
            slideCount={displayClips.length}
            activeSlideIndex={displayClips.findIndex(s => s.id === (activeSlide?.id ?? displayClips[0]?.id))}
            onLeaveFeedback={enterFeedbackMode}
            readOnly={isPreviewingVersion}
          />
        )}
      {!feedbackMode && !noteFocusNote && isPreviewingVersion && <VersionPreviewBanner version={previewVersion} />}
      {feedbackMode && <FeedbackLockBanner lockedCtx={lockedCtx} />}
      {noteFocusNote && (
        <StageLockBanner
          lockedCtx={{ slideTitle: activeSlide?.title, camName: 'Center', clipTime: noteFocusNote.clipTimeSeconds }}
          mode="annotation"
        />
      )}

      {/* ── Clip strip ── */}
      <ClipStrip
        clips={displayClips}
        activeId={activeSlide?.id ?? null}
        disabled={feedbackMode || !!noteFocusNote}
        onSelect={hasSnapshot ? (id) => { if (noteFocusNote) exitNoteFocusMode(); activateSlide(id) } : (id) => {
          const c = videoPlaylist.find(v => String(v.id) === String(id))
          if (c) activateRawClip(c)
        }}
      />

      {/* ── Main area: Stage + Right panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* Stage */}
        <div ref={stageViewportRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
            onHdriLoading={() => {}}
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
            freezeRenderLoop={feedbackMode || !!noteFocusNote}
          />

          {!feedbackMode && activeSlide?.title && (
            <StageTitleBadge title={activeSlide.title} />
          )}

          {/* Annotation layer — SVG drawing overlay in feedback mode */}
          {feedbackMode && (
            <AnnotationLayer
              annotation={annotation}
              activeTool={annotTool}
              onAnnotationChange={setAnnotation}
            />
          )}

          {/* Note focus mode: read-only annotation overlay */}
          {!feedbackMode && noteFocusNote?.annotation && (
            <AnnotationLayer
              annotation={noteFocusNote.annotation}
              activeTool={null}
              onAnnotationChange={() => {}}
              readOnly
            />
          )}

          {/* Stage lock badge — feedback mode or note focus mode */}
          {feedbackMode ? (
            <StageLockBadge camName={lockedCtx?.camName} clipTime={lockedCtx?.clipTime} />
          ) : noteFocusNote ? (
            <StageLockBadge camName="Center" clipTime={noteFocusNote.clipTimeSeconds} />
          ) : null}

          {/* Annotation toolbar — floating above transport in feedback mode */}
          {feedbackMode && (
            <AnnotationToolbar
              activeTool={annotTool}
              onToolChange={setAnnotTool}
              onClear={() => { setAnnotation(null); setAnnotTool(null) }}
              hasAnnotation={!!annotation}
            />
          )}

          {/* Transport bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 38, background: 'rgba(5,4,3,0.95)', borderTop: `1px solid rgba(220,100,30,0.14)`,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          }}>
            <button
              onClick={feedbackMode ? undefined : (isPlaying ? handlePause : handlePlay)}
              disabled={feedbackMode}
              style={{ background: 'none', border: 'none', color: feedbackMode ? T.text4 : (isPlaying ? T.text2 : T.text), cursor: feedbackMode ? 'default' : 'pointer', fontSize: 13 }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
              <div style={{ width: `${activeDuration > 0 ? Math.min(100, (currentTime / activeDuration) * 100) : 0}%`, height: '100%', background: T.ember, borderRadius: 2 }} />
            </div>
            <button
              onClick={handleStageScreenshot}
              disabled={feedbackMode}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minWidth: 118,
                padding: '6px 13px',
                borderRadius: 7,
                fontFamily: 'Chakra Petch, sans-serif',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
                border: `1px solid ${T.ember2}`,
                color: 'white',
                cursor: feedbackMode ? 'not-allowed' : 'pointer',
                boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.22)`,
                opacity: feedbackMode ? 0.45 : 1,
                flexShrink: 0,
              }}
              title="Capture stage visualizer"
            >
              <span aria-hidden="true">✦</span>
              Screenshot
            </button>
            {false && null && <span style={{ fontSize: 10, color: T.text2 }}>
              {formatDuration(currentTime)} / {formatDuration(activeDuration)} · {activeSlide?.title
                ? activeSlide.title
                : activeClipRaw?.name ?? '—'}
            </span>}
          </div>
          <NextSceneLoadingPopup
            show={sceneReady && isSwitchingClip}
            clipName={clipTransitionName}
          />

          {!feedbackMode && (
            <ClientViewFooter projectName={projectName} />
          )}
        </div>

        {/* ── Right panel: feedback draft or context ── */}
        {feedbackMode ? (
          <FeedbackDraftPanel
            lockedCtx={lockedCtx}
            reviewerName={reviewerName}
            reviewerNameLocked={reviewerNameLocked}
            comment={comment}
            annotation={annotation}
            onRemoveAnnotation={() => setAnnotation(null)}
            prevFeedback={prevFeedback}
            onUpdatePrevFeedback={handleUpdateClientFeedback}
            onDeletePrevFeedback={handleDeleteClientFeedback}
            onCancel={exitFeedbackMode}
            onSubmit={handleSubmitFeedback}
            isSubmitting={isSubmitting}
            submitError={submitError}
          />
        ) : (
          <RightContextRail projectName={projectName} collapsed={contextCollapsed}>
            {contextCollapsed ? (
          <CollapsedHandle
            clipTitle={activeSlide?.title ?? activeClipRaw?.name ?? '—'}
            feedbackCount={slideFeedback.length}
            onExpand={() => setContextCollapsed(false)}
            projectName={projectName}
          />
            ) : (
          <ContextPanel
            slide={activeSlide}
            feedbackItems={slideFeedback}
            onCollapse={() => setContextCollapsed(true)}
            onLeaveFeedback={isPreviewingVersion ? null : enterFeedbackMode}
            onUpdateFeedback={isPreviewingVersion ? null : handleUpdateClientFeedback}
            onDeleteFeedback={isPreviewingVersion ? null : handleDeleteClientFeedback}
            onNoteClick={enterNoteFocusMode}
            projectName={projectName}
            readOnly={isPreviewingVersion}
          />
            )}
          </RightContextRail>
        )}
      </div>
    </div>
  )
}

// ── Note Focus top bar ────────────────────────────────────────────────────────
function NoteFocusTopBar({ note, slideTitle, onExit }) {
  function fmtTime(s) {
    if (s == null) return ''
    const m = Math.floor(s / 60)
    const sec = String(Math.floor(s % 60)).padStart(2, '0')
    return ` · ${String(m).padStart(2, '0')}:${sec}`
  }
  const camName = 'Center'
  return (
    <div style={{
      height: 44, background: 'rgba(25,8,3,0.97)',
      borderBottom: `1px solid rgba(232,83,26,0.45)`,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
      flexShrink: 0, backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
        background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'white',
        boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
      }}>SV</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: 'Chakra Petch, sans-serif' }}>
        Director's Note
      </span>
      <div style={{ width: 1, height: 22, background: 'rgba(232,83,26,0.3)' }} />
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600,
        background: 'rgba(232,83,26,0.16)', border: `1px solid ${T.ember}`,
        color: T.ember2, fontFamily: 'Chakra Petch, sans-serif',
        boxShadow: T.emberGlow,
      }}>
        🔒 Camera Locked · {camName}
      </span>
      {slideTitle && (
        <span style={{
          background: 'rgba(232,83,26,0.1)', border: `1px solid rgba(232,83,26,0.3)`,
          borderRadius: 5, padding: '3px 10px',
          fontSize: 10, color: T.ember2, fontFamily: 'Chakra Petch, sans-serif',
        }}>
          {slideTitle}{fmtTime(note?.clipTimeSeconds)}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button onClick={onExit} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 500,
        background: T.glass, border: `1px solid ${T.border}`, color: T.text2,
      }}>
        ✕ Exit Note View
      </button>
    </div>
  )
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function ClientTopBar({ projectName, versionBadge, publishedAt, slideCount, activeSlideIndex, onLeaveFeedback, readOnly = false }) {
  return (
    <div style={{
      height: 44, background: 'rgba(10,8,6,0.94)', borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
      flexShrink: 0, backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
      boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
    }}>
      {/* Logo */}
      <div style={{
        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
        background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'white',
        boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
      }}>SV</div>

      <span style={{ fontSize: 13, fontWeight: 700 }}>StageViz</span>

      <div style={{ width: 1, height: 22, background: 'rgba(220,100,30,0.22)', flexShrink: 0 }} />

      <Col gap={1}>
        <span style={{ fontSize: 11, fontWeight: 500 }}>{projectName}</span>
        {publishedAt && (
          <span style={{ fontSize: 9, color: T.text3 }}>Released {timeAgo(publishedAt)}</span>
        )}
      </Col>

      {versionBadge && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 4,
          fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase',
          background: 'rgba(43,199,130,0.13)', border: `1px solid ${T.green}`, color: T.green,
        }}>
          {versionBadge}
        </span>
      )}

      {slideCount > 1 && (
        <span style={{
          background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(220,100,30,0.2)`,
          borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 600,
        }}>
          {activeSlideIndex + 1}/{slideCount}
        </span>
      )}

      <Spacer />

      <button onClick={readOnly ? undefined : onLeaveFeedback} disabled={readOnly} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 13px', borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 600,
        cursor: readOnly ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        background: readOnly ? 'rgba(255,255,255,0.05)' : `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
        border: `1px solid ${readOnly ? 'rgba(255,255,255,0.12)' : T.ember2}`,
        color: readOnly ? T.text3 : 'white',
        boxShadow: readOnly ? 'none' : `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}>
        {readOnly ? 'Preview only' : '✦ Leave Feedback'}
      </button>
    </div>
  )
}

// ── Clip strip ────────────────────────────────────────────────────────────────
function VersionPreviewBanner({ version }) {
  if (!version) return null
  return (
    <div style={{
      minHeight: 34,
      flexShrink: 0,
      background: 'rgba(232,149,24,0.12)',
      borderBottom: '1px solid rgba(232,149,24,0.38)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '6px 14px',
      color: T.amber,
      fontFamily: 'Chakra Petch, sans-serif',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      position: 'relative',
      zIndex: 9,
    }}>
      Previewing v{version.version_number} ({version.status}) - not the live published version
    </div>
  )
}

function ClipStrip({ clips, activeId, onSelect, disabled = false }) {
  if (!clips.length) return null
  return (
    <div style={{
      height: 70, background: 'rgba(6,4,3,0.92)', borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px',
      flexShrink: 0, overflowX: 'auto', overflowY: 'hidden',
    }}>
      {clips.map((clip, idx) => {
        const isActive = clip.id === activeId
        return (
          <button
            key={clip.id}
            onClick={() => { if (!disabled) onSelect(clip.id) }}
            disabled={disabled}
            style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '6px 10px', borderRadius: 8, flexShrink: 0, cursor: disabled ? 'not-allowed' : 'pointer',
              background: isActive ? 'rgba(232,83,26,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isActive ? T.ember : 'rgba(220,100,30,0.12)'}`,
              boxShadow: isActive ? '0 0 12px rgba(232,83,26,0.2)' : 'none',
              transition: 'all 0.15s',
              outline: 'none',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            <ClipThumbnail src={clip.thumbnailUrl || clip.thumbnail_url} active={isActive} />
            <Col gap={1} style={{ textAlign: 'left' }}>
              <span style={{
                fontSize: 11, fontWeight: isActive ? 600 : 500,
                color: isActive ? T.text : T.text2,
                whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'block',
              }}>
                {clip.title || clip.name || `Clip ${idx + 1}`}
              </span>
              <span style={{ fontSize: 9, color: T.text3 }}>
                {clip.durationSeconds ? formatDuration(clip.durationSeconds) : ''} #{idx + 1}
              </span>
            </Col>
          </button>
        )
      })}
    </div>
  )
}

// ── Right context panel (expanded) ────────────────────────────────────────────
function ClipThumbnail({ src, active, width = 46, height = 30, radius = 5 }) {
  return (
    <div style={{
      width, height, borderRadius: radius, flexShrink: 0,
      background: '#1a1410',
      backgroundImage: src
        ? `url("${src}")`
        : 'repeating-linear-gradient(135deg, #1a1410 0px, #1a1410 3px, #201810 3px, #201810 9px)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      border: `1px solid ${active ? T.ember : 'rgba(220,100,30,0.12)'}`,
      boxShadow: active ? '0 0 8px rgba(232,83,26,0.25)' : 'none',
      overflow: 'hidden',
    }} />
  )
}

function StageTitleBadge({ title }) {
  return (
    <div style={{
      position: 'absolute',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(520px, calc(100% - 48px))',
      minWidth: 220,
      padding: '7px 18px',
      borderRadius: 7,
      background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
      border: `1px solid ${T.ember2}`,
      color: '#140600',
      boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.28)`,
      fontSize: 13,
      fontWeight: 700,
      lineHeight: 1.2,
      textAlign: 'center',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 6,
    }}>
      {title}
    </div>
  )
}

function RightContextRail({ children, projectName, collapsed = false }) {
  return (
    <div style={{
      width: collapsed ? 44 : 304,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      transition: 'width 0.18s ease',
    }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {children}
      </div>
    </div>
  )
}

function ClientViewFooter({ projectName }) {
  return (
    <div style={{
      position: 'absolute',
      right: 14,
      bottom: 50,
      maxWidth: 'min(520px, calc(100% - 28px))',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '1.4px',
        textTransform: 'uppercase',
        color: T.ember,
        textShadow: '0 0 8px rgba(232,83,26,0.35)',
        display: 'block',
        userSelect: 'none',
      }}>
        {projectName ? `${projectName} · ` : ''}Visualized by Too:Awake
      </span>
    </div>
  )
}

function captureClientStagePanel(canvas, { title = '', projectName = '', includeTitle = true, includeFooter = true } = {}) {
  const w = canvas.width
  const h = canvas.height
  const displayRect = canvas.getBoundingClientRect()
  const scaleX = displayRect.width ? w / displayRect.width : 1
  const scaleY = displayRect.height ? h / displayRect.height : 1
  const offscreen = document.createElement('canvas')
  offscreen.width = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')

  ctx.drawImage(canvas, 0, 0, w, h)

  if (includeTitle && title) {
    const text = title.toUpperCase()
    ctx.save()
    ctx.font = `${Math.round(13 * scaleY)}px "Chakra Petch", sans-serif`
    ctx.font = `700 ${Math.round(13 * scaleY)}px "Chakra Petch", sans-serif`
    const padX = 18 * scaleX
    const padY = 7 * scaleY
    const boxH = Math.round(30 * scaleY)
    const minW = 220 * scaleX
    const maxW = Math.min(520 * scaleX, w - 48 * scaleX)
    const textW = ctx.measureText(text).width
    const boxW = Math.max(minW, Math.min(maxW, textW + padX * 2))
    const x = (w - boxW) / 2
    const y = 14 * scaleY
    const gradient = ctx.createLinearGradient(0, y, 0, y + boxH)
    gradient.addColorStop(0, '#FF7A2E')
    gradient.addColorStop(1, '#FF5F1F')

    drawRoundedRect(ctx, x, y, boxW, boxH, 7 * scaleY)
    ctx.shadowColor = 'rgba(255,95,31,0.45)'
    ctx.shadowBlur = 14 * scaleY
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#FF7A2E'
    ctx.lineWidth = Math.max(1, scaleY)
    ctx.stroke()

    ctx.fillStyle = '#140600'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ellipsisCanvasText(ctx, text, boxW - padX * 2), w / 2, y + boxH / 2 + padY * 0.05)
    ctx.restore()
  }

  if (includeFooter) {
    const displayName = (projectName || '').trim()
    const footer = `${displayName ? `${displayName} · ` : ''}Visualized by Too:Awake`.toUpperCase()
    ctx.save()
    ctx.font = `700 ${Math.round(10 * scaleY)}px "Chakra Petch", sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 5 * scaleY
    ctx.fillStyle = '#FF5F1F'
    ctx.fillText(footer, w - 14 * scaleX, h - 50 * scaleY)
    ctx.restore()
  }

  return offscreen.toDataURL('image/png')
}

async function captureFeedbackSnapshot(canvas, { projectId = '', slideId = '' } = {}) {
  const sourceWidth = canvas.width
  const sourceHeight = canvas.height
  if (!sourceWidth || !sourceHeight) return null

  const maxWidth = 2160
  const scale = Math.min(1, maxWidth / sourceWidth)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const offscreen = document.createElement('canvas')
  offscreen.width = width
  offscreen.height = height
  const ctx = offscreen.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(canvas, 0, 0, width, height)
  const blob = await new Promise((resolve) => {
    offscreen.toBlob(resolve, 'image/jpeg', 0.86)
  })
  const fallbackDataUrl = offscreen.toDataURL('image/jpeg', 0.78)
  if (!blob) {
    return {
      dataUrl: fallbackDataUrl,
      width,
      height,
      storage: 'inline-data-url',
    }
  }

  const safeSlide = String(slideId || 'slide').replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `${safeSlide}_feedback_snapshot.jpg`
  try {
    const { putUrl, publicUrl, key } = await getPresignedUploadUrl({
      filename,
      contentType: 'image/jpeg',
      projectId,
      type: 'snapshot',
    })
    const file = new File([blob], filename, { type: 'image/jpeg' })
    const url = await uploadFileToPresignedUrl(putUrl, file, publicUrl, null)
    return {
      url,
      key,
      width,
      height,
      contentType: 'image/jpeg',
      storage: 'r2',
    }
  } catch {
    return {
      dataUrl: fallbackDataUrl,
      width,
      height,
      storage: 'inline-data-url',
      uploadFailed: true,
    }
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function ellipsisCanvasText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1)
  }
  return `${next}...`
}

function ContextPanel({ slide, feedbackItems = [], onCollapse, onLeaveFeedback, onUpdateFeedback, onDeleteFeedback, onNoteClick, projectName, readOnly = false }) {
  return (
    <div style={{
      width: 304, flexShrink: 0,
      background: T.glassDark, backdropFilter: 'blur(14px)',
      borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      flex: '1 1 auto', minHeight: 0,
    }}>
      {/* Clip title header */}
      <div style={{
        padding: '15px 16px 13px',
        borderBottom: `1px solid rgba(220,100,30,0.12)`,
        flexShrink: 0,
        background: 'rgba(0,0,0,0.18)',
      }}>
        <Row gap={8} align="flex-start">
          <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 17, fontWeight: 700, color: T.text,
              lineHeight: 1.25, letterSpacing: '0.01em',
              display: 'block',
            }}>
              {slide?.title || '—'}
            </span>
            {slide?.subtitle && (
              <span style={{ fontSize: 12, color: T.text2, lineHeight: 1.45, display: 'block' }}>
                {slide.subtitle}
              </span>
            )}
          </Col>
          <button onClick={onCollapse} style={{
            background: T.glass, border: `1px solid ${T.border}`, borderRadius: 5,
            color: T.text3, cursor: 'pointer', padding: '4px 7px',
            fontSize: 12, flexShrink: 0, marginTop: 1,
          }}>⟩</button>
        </Row>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <Col gap={16}>

          {/* Director's notes (v2 multi-note) */}
          {(() => {
            const notes = (slide?.directorNotes ?? []).filter(n => n.visibleToClient && n.text?.trim())
            // Legacy fallback: no directorNotes array but old directorNote string
            if (notes.length === 0 && slide?.directorNoteVisible && slide?.directorNote) {
              return (
                <Col gap={7}>
                  <SectionLabel>Director's Note</SectionLabel>
                  <p style={{
                    fontSize: 15, color: T.text, lineHeight: 1.72, margin: 0,
                    background: 'rgba(232,83,26,0.075)', border: `1px solid rgba(232,83,26,0.22)`,
                    borderRadius: 7, padding: '13px 14px',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}>
                    {slide.directorNote}
                  </p>
                </Col>
              )
            }
            if (notes.length === 0) return null
            return (
              <Col gap={7}>
                <SectionLabel>Director's Notes ({notes.length})</SectionLabel>
                <Col gap={7}>
                  {notes.map((note, idx) => {
                    const hasAnnotation = !!note.annotation
                    const clickable = hasAnnotation
                    return (
                      <div
                        key={note.id}
                        onClick={clickable ? () => onNoteClick?.(note) : undefined}
                        style={{
                          cursor: clickable ? 'pointer' : 'default',
                          background: 'rgba(232,83,26,0.075)', border: `1px solid ${clickable ? 'rgba(232,83,26,0.35)' : 'rgba(232,83,26,0.22)'}`,
                          borderRadius: 7, padding: '11px 14px',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        {hasAnnotation && (
                          <span style={{
                            display: 'inline-block', fontSize: 9, fontWeight: 600,
                            color: T.ember2, fontFamily: 'Chakra Petch, sans-serif',
                            background: 'rgba(232,83,26,0.12)', border: `1px solid rgba(232,83,26,0.25)`,
                            borderRadius: 3, padding: '1px 5px', marginBottom: 6,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                          }}>
                            ● Click to focus
                          </span>
                        )}
                        <p style={{ fontSize: 15, color: T.text, lineHeight: 1.72, margin: 0 }}>
                          {note.text}
                        </p>
                      </div>
                    )
                  })}
                </Col>
              </Col>
            )
          })()}

          {/* References */}
          {(() => {
            const visibleRefs = (slide?.references ?? []).filter(r => r.visibleToClient)
            if (!visibleRefs.length) return null
            return (
              <Col gap={8}>
                <SectionLabel>References ({visibleRefs.length})</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                  {visibleRefs.map(ref => (
                    <RefThumb key={ref.id} caption={ref.caption} url={ref.url} />
                  ))}
                </div>
              </Col>
            )
          })()}

          <FeedbackHistoryList
            items={feedbackItems}
            onUpdateFeedback={onUpdateFeedback}
            onDeleteFeedback={onDeleteFeedback}
          />

        </Col>
      </div>

      {!readOnly && (
      <div style={{ padding: '13px 16px 10px', borderTop: `1px solid rgba(220,100,30,0.1)`, flexShrink: 0 }}>
        <button onClick={onLeaveFeedback} style={{
          width: '100%', padding: '9px', borderRadius: 7,
          fontFamily: 'Chakra Petch, sans-serif', fontSize: 12, fontWeight: 600,
          background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
          border: `1px solid ${T.ember2}`, color: 'white', cursor: 'pointer',
          boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
        }}>
          ✦ Leave Feedback
        </button>
      </div>
      )}

      {/* Branding watermark — replaces GlobalFooter for client view */}
      <div style={{
        padding: '9px 16px 11px',
        borderTop: `1px solid rgba(220,100,30,0.07)`,
        display: 'none',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '1.4px',
          textTransform: 'uppercase', color: T.ember,
          textShadow: '0 0 8px rgba(232,83,26,0.35)',
          display: 'block',
          userSelect: 'none',
        }}>
          {projectName ? `${projectName} · ` : ''}Visualized by Too:Awake
        </span>
      </div>
    </div>
  )
}

// ── Collapsed handle ──────────────────────────────────────────────────────────
function CollapsedHandle({ clipTitle, feedbackCount, onExpand, projectName }) {
  return (
    <div
      onClick={onExpand}
      style={{
        width: 44, flexShrink: 0,
        background: T.glassDark, backdropFilter: 'blur(14px)',
        borderLeft: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0', gap: 12, cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 12, color: T.text3 }}>‹</span>
      <span style={{
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        fontSize: 10, fontWeight: 600, color: T.text2, letterSpacing: '0.06em',
        maxHeight: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {clipTitle}
      </span>
      {feedbackCount > 0 && (
        <span style={{
          background: T.amber, borderRadius: '50%', width: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#1a0a00', fontWeight: 700,
        }}>
          {feedbackCount}
        </span>
      )}
      {/* Branding — rotated at bottom */}
      <div style={{ flex: 1 }} />
      <span style={{
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        fontSize: 7, fontWeight: 700, letterSpacing: '1px',
        textTransform: 'uppercase', color: T.ember, opacity: 0.6,
        whiteSpace: 'nowrap', userSelect: 'none',
      }}>
        Too:Awake
      </span>
    </div>
  )
}

// ── Tiny primitives ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: T.text3,
    }}>{children}</span>
  )
}

function RefThumb({ caption, url }) {
  return (
    <div style={{ width: 88 }}>
      <div style={{
        width: 88, height: 58, borderRadius: 6,
        background: '#1a1410', border: `1px solid rgba(220,100,30,0.15)`,
        backgroundImage: url
          ? `url(${url})`
          : 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(220,100,30,0.05) 4px, rgba(220,100,30,0.05) 5px)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!url && <span style={{ fontSize: 9, color: T.text3 }}>ref</span>}
      </div>
      {caption && (
        <span style={{
          display: 'block', marginTop: 5, fontSize: 10, color: T.text2,
          textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{caption}</span>
      )}
    </div>
  )
}

// ── Error screens ─────────────────────────────────────────────────────────────
function FeedbackHistoryList({ items = [], onUpdateFeedback, onDeleteFeedback }) {
  return (
    <Col gap={8}>
      <Row gap={8}>
        <SectionLabel>Feedback ({items.length})</SectionLabel>
        {items.some(item => item.status === 'pending') && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontWeight: 700,
            color: T.amber,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Pending
          </span>
        )}
      </Row>
      {items.length ? (
        <Col gap={8}>
          {items.map(item => (
            <FeedbackHistoryItem
              key={item.id}
              item={item}
              onUpdateFeedback={onUpdateFeedback}
              onDeleteFeedback={onDeleteFeedback}
            />
          ))}
        </Col>
      ) : (
        <div style={{
          border: `1px dashed rgba(220,100,30,0.18)`,
          borderRadius: 7,
          padding: '12px 13px',
          background: 'rgba(0,0,0,0.18)',
        }}>
          <span style={{ fontSize: 12, lineHeight: 1.55, color: T.text3, display: 'block' }}>
            No feedback has been added for this clip yet.
          </span>
        </div>
      )}
    </Col>
  )
}

function FeedbackHistoryItem({ item, onUpdateFeedback, onDeleteFeedback }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftComment, setDraftComment] = useState(item.comment ?? '')
  const [isBusy, setIsBusy] = useState(false)
  const name = item.reviewer_name || 'Reviewer'
  const clipMeta = [
    item.camera_snapshot_json?.name,
    item.clip_time_seconds != null ? formatDuration(item.clip_time_seconds) : null,
  ].filter(Boolean).join(' / ')
  const canEdit = Boolean(onUpdateFeedback && onDeleteFeedback)
  const canSave = draftComment.trim().length > 0 && draftComment.trim() !== (item.comment ?? '').trim() && !isBusy

  useEffect(() => {
    if (!isEditing) setDraftComment(item.comment ?? '')
  }, [isEditing, item.comment])

  async function saveEdit() {
    if (!canSave) return
    setIsBusy(true)
    try {
      await onUpdateFeedback(item, { comment: draftComment.trim() })
      setIsEditing(false)
    } finally {
      setIsBusy(false)
    }
  }

  async function deleteItem() {
    if (!onDeleteFeedback) return
    setIsBusy(true)
    try {
      await onDeleteFeedback(item)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div style={{
      border: `1px solid rgba(220,100,30,0.16)`,
      borderRadius: 7,
      padding: '10px 11px',
      background: 'rgba(0,0,0,0.22)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
    }}>
      <Row gap={7} align="flex-start" style={{ marginBottom: 7 }}>
        <div style={{
          width: 23,
          height: 23,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(232,83,26,0.14)',
          border: `1px solid rgba(232,83,26,0.35)`,
          color: T.ember2,
          fontSize: 10,
          fontWeight: 800,
        }}>
          {name.trim().slice(0, 1).toUpperCase()}
        </div>
        <Col gap={1} style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
            {name}
          </span>
          <span style={{ fontSize: 10, color: T.text3, lineHeight: 1.3 }}>
            {timeAgo(item.created_at)}
            {clipMeta ? ` / ${clipMeta}` : ''}
          </span>
        </Col>
        <span style={{
          flexShrink: 0,
          padding: '2px 6px',
          borderRadius: 4,
          border: `1px solid ${item.status === 'resolved' ? 'rgba(43,199,130,0.4)' : 'rgba(232,149,24,0.45)'}`,
          color: item.status === 'resolved' ? T.green : T.amber,
          background: item.status === 'resolved' ? 'rgba(43,199,130,0.09)' : 'rgba(232,149,24,0.1)',
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}>
          {item.status || 'pending'}
        </span>
      </Row>
      {isEditing ? (
        <Col gap={7}>
          <textarea
            value={draftComment}
            onChange={e => setDraftComment(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.35)',
              border: `1px solid ${draftComment.trim() ? 'rgba(220,100,30,0.22)' : 'rgba(232,83,26,0.5)'}`,
              borderRadius: 6,
              padding: '8px 9px',
              fontFamily: 'Chakra Petch, sans-serif',
              fontSize: 12,
              lineHeight: 1.5,
              color: T.text,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <Row gap={6}>
            <button onClick={saveEdit} disabled={!canSave} style={feedbackActionStyle(canSave)}>Save</button>
            <button
              onClick={() => { setDraftComment(item.comment ?? ''); setIsEditing(false) }}
              disabled={isBusy}
              style={feedbackActionStyle(!isBusy)}
            >
              Cancel
            </button>
          </Row>
        </Col>
      ) : (
        <p style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: T.text2,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}>
          {item.comment}
        </p>
      )}
      {canEdit && !isEditing && (
        <Row gap={6} style={{ marginTop: 8 }}>
          <button onClick={() => setIsEditing(true)} disabled={isBusy} style={feedbackActionStyle(!isBusy)}>Edit</button>
          <button onClick={deleteItem} disabled={isBusy} style={feedbackActionStyle(!isBusy, true)}>Delete</button>
        </Row>
      )}
    </div>
  )
}

// ── Mobile components ─────────────────────────────────────────────────────────
function MobileTopBar({ projectName, versionBadge }) {
  return (
    <div style={{
      height: 44, background: 'rgba(10,8,6,0.94)', borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
      flexShrink: 0, backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
        background: `linear-gradient(135deg, ${T.ember2}, ${T.ember})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'white',
        boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
      }}>SV</div>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{projectName}</span>
      {versionBadge && (
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          background: 'rgba(43,199,130,0.13)', border: `1px solid ${T.green}`, color: T.green,
        }}>{versionBadge}</span>
      )}
    </div>
  )
}

function MobileBottomTabBar({ activeTab, onTabChange, clipCount = 0, feedbackCount = 0, refCount = 0 }) {
  const tabs = [
    { id: 'clips',   label: 'Clips',      badge: clipCount > 1 ? clipCount : null },
    { id: 'context', label: 'Context',    badge: feedbackCount > 0 ? feedbackCount : null },
    { id: 'refs',    label: 'References', badge: refCount > 0 ? refCount : null },
  ]
  return (
    <div style={{
      height: 56, flexShrink: 0,
      background: 'rgba(8,6,4,0.97)', borderTop: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'stretch',
    }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              color: isActive ? T.ember : T.text3,
              borderTop: `2px solid ${isActive ? T.ember : 'transparent'}`,
              position: 'relative', padding: 0,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {tab.label}
            </span>
            {tab.badge != null && (
              <span style={{
                position: 'absolute', top: 8, right: 'calc(50% - 20px)',
                background: T.amber, borderRadius: '50%', width: 14, height: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: '#1a0a00', fontWeight: 700,
              }}>{tab.badge > 9 ? '9+' : tab.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MobileDrawer({ children, title, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }}
      />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
        maxHeight: '72vh', background: T.glassDark,
        borderTop: `1px solid ${T.border}`, borderRadius: '18px 18px 0 0',
        display: 'flex', flexDirection: 'column',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          padding: '12px 16px 0', flexShrink: 0,
          display: 'flex', justifyContent: 'center',
        }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>
        <div style={{ padding: '10px 16px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.text2 }}>{title}</span>
          <button onClick={onClose} style={{
            background: T.glass, border: `1px solid ${T.border}`, borderRadius: 5,
            color: T.text3, cursor: 'pointer', padding: '4px 9px', fontSize: 12,
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
          {children}
        </div>
      </div>
    </>
  )
}

function MobileClipList({ clips, activeId, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {clips.map((clip, idx) => {
        const isActive = clip.id === activeId
        return (
          <button
            key={clip.id}
            onClick={() => onSelect(clip.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              background: isActive ? 'rgba(232,83,26,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isActive ? T.ember : 'rgba(220,100,30,0.12)'}`,
              boxShadow: isActive ? '0 0 14px rgba(232,83,26,0.18)' : 'none',
              width: '100%',
            }}
          >
            <ClipThumbnail
              src={clip.thumbnailUrl || clip.thumbnail_url}
              active={isActive}
              width={60}
              height={40}
              radius={7}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: isActive ? 600 : 500,
                color: isActive ? T.text : T.text2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {clip.title || clip.name || `Clip ${idx + 1}`}
              </div>
              {clip.subtitle && (
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {clip.subtitle}
                </div>
              )}
              <div style={{ fontSize: 10, color: T.text4, marginTop: 2 }}>Scene {idx + 1}</div>
            </div>
            {isActive && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: T.ember, boxShadow: `0 0 8px ${T.ember}` }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

function MobileContextContent({ slide, feedbackItems = [] }) {
  return (
    <Col gap={16}>
      {slide?.title && (
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{slide.title}</div>
          {slide.subtitle && <div style={{ fontSize: 13, color: T.text2, marginTop: 4, lineHeight: 1.5 }}>{slide.subtitle}</div>}
        </div>
      )}
      {slide?.directorNoteVisible && slide?.directorNote && (
        <Col gap={7}>
          <SectionLabel>Director's Note</SectionLabel>
          <p style={{
            fontSize: 14, color: T.text, lineHeight: 1.72, margin: 0,
            background: 'rgba(232,83,26,0.075)', border: `1px solid rgba(232,83,26,0.22)`,
            borderRadius: 7, padding: '13px 14px',
          }}>
            {slide.directorNote}
          </p>
        </Col>
      )}
      <FeedbackHistoryList items={feedbackItems} />
    </Col>
  )
}

function MobileReferencesContent({ slide }) {
  const refs = (slide?.references ?? []).filter(r => r.visibleToClient)
  if (!refs.length) {
    return (
      <div style={{
        border: `1px dashed rgba(220,100,30,0.18)`, borderRadius: 7,
        padding: '20px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 13, color: T.text3 }}>No references for this scene.</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {refs.map(ref => <RefThumb key={ref.id} caption={ref.caption} url={ref.url} />)}
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

function ClientProjectNotFound({ projectId }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0c]">
      <div className="bg-black/60 border border-white/10 rounded-2xl px-10 py-8 flex flex-col items-center gap-5 max-w-sm text-center">
        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">🔍</div>
        <div>
          <p className="text-white/90 text-base font-semibold">Presentation Not Available</p>
          <p className="text-white/40 text-sm mt-1">This link is either invalid or the project has not been published yet.</p>
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
        <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">🔒</div>
        <div>
          <p className="text-white/90 text-base font-semibold">Link Locked</p>
          <p className="text-white/40 text-sm mt-1">This presentation has been made private by the administrator.</p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function feedbackActionStyle(enabled, danger = false) {
  return {
    padding: '3px 8px',
    borderRadius: 5,
    fontSize: 9,
    fontFamily: 'Chakra Petch, sans-serif',
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: danger ? 'rgba(232,83,26,0.10)' : T.glass,
    border: `1px solid ${danger ? 'rgba(232,83,26,0.35)' : T.border}`,
    color: enabled ? (danger ? T.ember2 : T.text2) : T.text4,
    opacity: enabled ? 1 : 0.6,
  }
}

function findPreset(presets, presetIdOrName) {
  if (!Array.isArray(presets) || presetIdOrName == null) return null
  return (
    presets.find(p => String(p.id) === String(presetIdOrName)) ||
    presets.find(p => String(p.name).toLowerCase() === String(presetIdOrName).toLowerCase()) ||
    null
  )
}

function findPresetByName(presets, name) {
  if (!Array.isArray(presets) || !name) return null
  return presets.find(p => String(p.name).toLowerCase() === String(name).toLowerCase()) || null
}

function rawToSlide(clip, i) {
  return {
    id: String(clip.id),
    clipId: String(clip.id),
    title: clip.name || `Clip ${i + 1}`,
    subtitle: '',
    directorNote: '',
    directorNoteVisible: false,
    defaultCameraPresetId: '',
    hiddenFromClient: false,
    durationSeconds: 0,
    thumbnailUrl: clip.thumbnailUrl || clip.thumbnail_url || '',
    references: [],
  }
}

function formatDuration(s) {
  if (!s) return ''
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function timeAgo(ts) {
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1d ago'
  return `${d}d ago`
}

export default ClientPage

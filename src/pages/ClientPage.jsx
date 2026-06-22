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
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent'
import { useClientSessionTracking } from '../hooks/useClientSessionTracking'
import { supabase } from '../lib/supabaseClient'
import { clearMemCache, fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { deleteFeedback, loadPublishedVersion, loadVersionById, submitFeedback, loadFeedback, updateFeedback, hydrateSnapshot } from '../lib/presentationVersions'
import { getPresignedUploadUrl, uploadFileToPresignedUrl } from '../utils/r2Upload'
import { isMultiMapledClip, getClipSources, buildImageMediaByTarget, getClipMediaType } from '../utils/mapledMedia'
import { createMapledPlaybackController } from '../utils/multiMapledPlayback'
import { FeedbackDraftPanel, AnnotationLayer, AnnotationToolbar, FeedbackTopBar, FeedbackLockBanner, StageLockBanner, StageLockBadge } from '../components/FeedbackDraftPanel'
import GuestGate, { getStoredGuest } from '../components/GuestGate'

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

const FEEDBACK_PENDING_PREFIX = 'stageviz:feedback-pending'

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
}

function readPendingFeedbackDraft(key) {
  const raw = safeLocalStorageGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    safeLocalStorageRemove(key)
    return null
  }
}

// Physical device orientation, independent of the visual viewport. The soft
// keyboard shrinks the visual viewport (and CSS `orientation` media query can
// follow it), so we prefer screen.orientation which reflects the real device.
function readDeviceLandscape() {
  if (typeof window === 'undefined') return false
  const type = window.screen?.orientation?.type
  if (type) return type.startsWith('landscape')
  if (window.matchMedia) return window.matchMedia('(orientation: landscape)').matches
  return window.innerWidth > window.innerHeight
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

  // ── Guest identity gate ───────────────────────────────────────────────────
  const [isAdmin,        setIsAdmin]        = useState(false)
  const [gateConfirmed,  setGateConfirmed]  = useState(false)
  const [guestIdentity,  setGuestIdentity]  = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setIsAdmin(true); setGateConfirmed(true) }
    })
  }, [])

  const { loadingManager, progress, status, loaded: stageLoaded, reset: resetStageLoading } = useStageLoading()

  // ── Stage state ───────────────────────────────────────────────────────────
  const [modelUrl,         setModelUrl]         = useState(null)
  const [videoElement,     setVideoElement]     = useState(null)
  const [activeImageUrl,   setActiveImageUrl]   = useState(null)
  const [mediaByTarget,    setMediaByTarget]    = useState(null)   // multi-mapled: targetId → { videoElement }
  const [ledTargetMap,     setLedTargetMap]     = useState({})
  const mapledControllerRef = useRef(null)
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
  const [referenceViewer, setReferenceViewer] = useState(null) // { refs, index }

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

  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }))
  // Physical device orientation — NOT derived from live viewport, so the soft
  // keyboard (which shrinks the visual viewport) can never flip the layout.
  const [isLandscape, setIsLandscape] = useState(() => readDeviceLandscape())
  // Visual-viewport height, used ONLY to size the keyboard-aware feedback sheet.
  const [keyboardViewportHeight, setKeyboardViewportHeight] = useState(() =>
    typeof window !== 'undefined'
      ? Math.round(window.visualViewport?.height ?? window.innerHeight)
      : 768
  )
  const isMobile = viewport.width < 768 || viewport.height < 520
  const isMobileLandscape = isMobile && isLandscape
  const [activeMobileTab, setActiveMobileTab] = useState('context')
  const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(false)
  const [mobileFeedbackSheet, setMobileFeedbackSheet] = useState(null)
  const [mobileFeedbackName, setMobileFeedbackName] = useState('')
  const [mobileFeedbackComment, setMobileFeedbackComment] = useState('')
  const isPreviewingVersion = Boolean(previewVersion)

  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()
  useProjectStats(projectId, 'client')
  const { startClipWatch } = useClientSessionTracking(projectId)
  const currentCameraRef = useRef(null)
  const stageViewportRef = useRef(null)
  const LS_NAME_KEY = `stageviz:reviewer-name:${projectId}`
  const { consent: analyticsConsent, grant: grantConsent, deny: denyConsent, isUnset: consentUnset } = useAnalyticsConsent()
  const getPendingFeedbackKey = useCallback((slideId) => (
    slideId ? `${FEEDBACK_PENDING_PREFIX}:${projectId}:${slideId}` : null
  ), [projectId])

  const savePendingFeedbackDraft = useCallback((slideId, draft) => {
    const key = getPendingFeedbackKey(slideId)
    if (!key) return
    safeLocalStorageSet(key, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
  }, [getPendingFeedbackKey])

  const clearPendingFeedbackDraft = useCallback((slideId) => {
    const key = getPendingFeedbackKey(slideId)
    if (key) safeLocalStorageRemove(key)
  }, [getPendingFeedbackKey])

  const loadPendingFeedbackDraft = useCallback((slideId) => {
    const key = getPendingFeedbackKey(slideId)
    return key ? readPendingFeedbackDraft(key) : null
  }, [getPendingFeedbackKey])

  // Load persisted reviewer name (only when reviewer has granted consent)
  useEffect(() => {
    if (analyticsConsent !== 'granted') {
      setReviewerNameLocked(false)
      return
    }
    const saved = safeLocalStorageGet(LS_NAME_KEY)
    if (saved) {
      setReviewerName(saved)
      setReviewerNameLocked(true)
    } else {
      setReviewerNameLocked(false)
    }
  }, [LS_NAME_KEY, analyticsConsent])

  useEffect(() => {
    if (!guestIdentity?.name || isAdmin) return
    setReviewerName(guestIdentity.name)
    setReviewerNameLocked(true)
  }, [guestIdentity, isAdmin])

  useEffect(() => {
    // Layout size + orientation: driven by the window/device, never by the
    // visual viewport — otherwise the soft keyboard would re-flip portrait
    // <-> landscape and the whole shell would jump around while typing.
    const onLayoutChange = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setIsLandscape(readDeviceLandscape())
    }
    // Keyboard-aware height: only this is allowed to follow the visual viewport.
    const onKeyboardChange = () => {
      setKeyboardViewportHeight(Math.round(window.visualViewport?.height ?? window.innerHeight))
    }

    onLayoutChange()
    onKeyboardChange()

    window.addEventListener('resize', onLayoutChange)
    window.addEventListener('orientationchange', onLayoutChange)
    const orientationApi = window.screen?.orientation
    orientationApi?.addEventListener?.('change', onLayoutChange)
    window.visualViewport?.addEventListener('resize', onKeyboardChange)
    window.visualViewport?.addEventListener('scroll', onKeyboardChange)
    return () => {
      window.removeEventListener('resize', onLayoutChange)
      window.removeEventListener('orientationchange', onLayoutChange)
      orientationApi?.removeEventListener?.('change', onLayoutChange)
      window.visualViewport?.removeEventListener('resize', onKeyboardChange)
      window.visualViewport?.removeEventListener('scroll', onKeyboardChange)
    }
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
        guestToken: guestIdentity?.guest_token,
      })
      setSlideFeedback(items)
      return items
    } catch {
      setSlideFeedback([])
      return []
    }
  }, [activeSlide?.id, guestIdentity?.guest_token, projectId, publishedVersion?.id])

  useEffect(() => {
    refreshSlideFeedback(activeSlide?.id)
  }, [activeSlide?.id, refreshSlideFeedback])

  const openReferenceViewer = useCallback((refs, index = 0) => {
    const visibleRefs = (refs ?? []).filter(r => r.visibleToClient && r.url)
    if (!visibleRefs.length) return
    const safeIndex = Math.max(0, Math.min(index, visibleRefs.length - 1))
    setReferenceViewer({ refs: visibleRefs, index: safeIndex })
  }, [])

  const closeReferenceViewer = useCallback(() => {
    setReferenceViewer(null)
  }, [])

  const stepReferenceViewer = useCallback((direction) => {
    setReferenceViewer(current => {
      if (!current?.refs?.length) return current
      const total = current.refs.length
      return {
        ...current,
        index: (current.index + direction + total) % total,
      }
    })
  }, [])

  useEffect(() => {
    if (!referenceViewer) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeReferenceViewer()
      if (event.key === 'ArrowLeft') stepReferenceViewer(-1)
      if (event.key === 'ArrowRight') stepReferenceViewer(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeReferenceViewer, referenceViewer, stepReferenceViewer])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
  }, [])

  useEffect(() => { resetStageLoading() }, [projectId, resetStageLoading])

  // Tear down any multi-mapled follower videos on unmount
  useEffect(() => () => {
    mapledControllerRef.current?.destroy()
    mapledControllerRef.current = null
  }, [])

  // ── Video activation ──────────────────────────────────────────────────────
  const resolvePlayableUrl = useCallback(async (clip) => {
    if (!clip?.url || !isRemoteUrl(clip.url)) return clip?.url
    const blobUrl = await fetchAsBlobUrlWithCache(clip.url)
    addBlob(blobUrl)
    return blobUrl
  }, [addBlob])

  const teardownMapledController = useCallback(() => {
    if (mapledControllerRef.current) {
      mapledControllerRef.current.destroy()
      mapledControllerRef.current = null
    }
    setMediaByTarget(null)
  }, [])

  const activateVideo = useCallback((id, url, activationSeq, multi = null) => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    teardownMapledController()
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
      // Multi-mapled: attach followers to this master before it starts so they
      // join the very first play() and stay in lockstep.
      if (multi?.followers?.length) {
        mapledControllerRef.current = createMapledPlaybackController({
          masterVideo: v,
          masterTargetId: multi.masterTargetId,
          followers: multi.followers,
        })
        setMediaByTarget(mapledControllerRef.current.mediaByTarget)
      }
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

    v.crossOrigin = 'anonymous'
    v.muted = true
    v.setAttribute('muted', '')
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.loop = true
    v.preload = 'auto'
    v.src = url
    v.load()
  }, [teardownMapledController])

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

    if (getClipMediaType(clip) === 'image') {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current = null
      }
      teardownMapledController()
      setVideoElement(null)
      setActiveVideoId(clip.id)
      setIsPlaying(false)

      // Multi-mapled stills: one image per LED map (no video controller needed).
      if (isMultiMapledClip(clip)) {
        const map = await buildImageMediaByTarget(clip, async (u) => {
          if (isRemoteUrl(u)) { const b = await fetchAsBlobUrlWithCache(u); addBlob(b); return b }
          return u
        })
        if (activationSeq !== activationSeqRef.current) return
        setActiveImageUrl(null)
        setMediaByTarget(map)
      } else {
        setActiveImageUrl(url)
      }
      return
    }

    setActiveImageUrl(null)

    // Multi-mapled clip: resolve each follower source and drive them in lockstep
    // with the master (sources[0], already resolved as `url`).
    if (isMultiMapledClip(clip)) {
      const sources = getClipSources(clip)
      const followers = []
      for (let i = 1; i < sources.length; i += 1) {
        let fu = sources[i].url
        try {
          if (isRemoteUrl(fu)) { const b = await fetchAsBlobUrlWithCache(fu); addBlob(b); fu = b }
        } catch { /* fall back to the raw url */ }
        followers.push({ targetId: sources[i].targetId, url: fu })
      }
      if (activationSeq !== activationSeqRef.current) return
      activateVideo(clip.id, url, activationSeq, { masterTargetId: sources[0]?.targetId, followers })
      return
    }

    activateVideo(clip.id, url, activationSeq)
  }, [activateVideo, addBlob, projectId, resolvePlayableUrl, startClipWatch, teardownMapledController])

  const applySlideDefaultCamera = useCallback(function applySlideDefaultCamera(slide, presets = cameraPresets) {
    if (!slide?.defaultCameraPresetId) return
    const preset = findPreset(presets, slide.defaultCameraPresetId)
    if (!preset) return
    setActivePresetId(preset.id)
    setCameraTargetPreset(cameraTargetPresetRef, preset)
    currentCameraRef.current = preset.name || String(preset.id)
  }, [cameraPresets])

  // ── Load project ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gateConfirmed) return
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
        let { data, error } = await supabase
          .from('projects_client_public')
          .select('id, name, stage_url, video_url, media_playlist, camera_presets, grid_cell_size, scene_config, group_id, is_client_locked')
          .eq('id', projectId)
          .single()

        if (cancelled) return
        if (error || !data) {
          const fallback = await supabase
            .from('projects')
            .select('id, name, stage_url, video_url, media_playlist, camera_presets, grid_cell_size, scene_config, group_id, is_client_locked')
            .eq('id', projectId)
            .single()
          data = fallback.data
          error = fallback.error
        }
        if (error || !data) { setProjectNotFound(true); return }

        // Client lock check
        if (data.is_client_locked) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) { setClientLocked(true); setIsDbLoading(false); return }
          const { data: ownedProject } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .maybeSingle()
          if (!ownedProject) { setClientLocked(true); setIsDbLoading(false); return }
        }
        setClientLocked(false)
        if (analyticsConsent === 'granted') {
          recordClientPageView(projectId)
        }

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
              applySlideDefaultCamera(snapshotSlides[0], hydratedSnap.cameraPresets)
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
            const first = snapshotSlides[0]
              ? findClipForSlide(snapshotSlides[0], restored, 0)
              : restored[0]
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
          if (cfg.ledTargetMap && typeof cfg.ledTargetMap === 'object') setLedTargetMap(cfg.ledTargetMap)
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
  // Intentional: applySlideDefaultCamera depends on cameraPresets which this
  // effect itself sets — including it in deps causes an infinite reload loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateConfirmed, isAdmin, projectId, previewVersionId, activateClip, addBlob, revokeAllBlobs])

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

  // ── Activate slide → switch clip + camera ─────────────────────────────────
  const activateSlide = useCallback((slideId) => {
    const slide = presentationSlides.find(s => s.id === slideId)
    setActiveSlideId(slideId)
    if (!slide) return

    // Switch clip
    const slideIndex = presentationSlides.findIndex(s => s.id === slideId)
    const clip = findClipForSlide(slide, videoPlaylist, slideIndex)

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

  const handleCameraPresetSelect = useCallback((preset) => {
    if (!preset || feedbackMode || noteFocusNote) return
    setActivePresetId(preset.id)
    setCameraTargetPreset(cameraTargetPresetRef, preset)
    currentCameraRef.current = preset.name || String(preset.id)
    recordClientInteraction(projectId, 'camera_change', preset.name || String(preset.id))
  }, [feedbackMode, noteFocusNote, projectId])

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
    const pendingDraft = loadPendingFeedbackDraft(activeSlide?.id)
    if (pendingDraft?.reviewerName) {
      setReviewerName(pendingDraft.reviewerName)
      setReviewerNameLocked(true)
    }
    setComment(pendingDraft?.comment ?? '')
    setSubmitError(pendingDraft ? 'Unsaved feedback draft restored. Submit again when ready.' : null)
    setFeedbackMode(true)

    // Load previous feedback for this slide
    const items = slideFeedback.length ? slideFeedback : await refreshSlideFeedback(activeSlide?.id)
    setPrevFeedback(items)
  }, [activePresetId, activeSlide, cameraPresets, isPreviewingVersion, loadPendingFeedbackDraft, publishedVersion, refreshSlideFeedback, slideFeedback])

  const exitFeedbackMode = useCallback(() => {
    if (cameraControlsRef.current) cameraControlsRef.current.enabled = true
    setFeedbackMode(false)
    setLockedCtx(null)
    setAnnotation(null)
    setAnnotTool(null)
    setComment('')
    setSubmitError(null)
  }, [])


  const openMobileFeedbackSheet = useCallback(() => {
    if (isPreviewingVersion || !activeSlide?.id) return

    videoRef.current?.pause()
    setIsPlaying(false)

    const clipTime = videoRef.current?.currentTime ?? currentTime ?? 0
    const camPreset = findPreset(cameraPresets, activePresetId)
    const vLabel = publishedVersion ? `v${publishedVersion.version_number}` : null

    const pendingDraft = loadPendingFeedbackDraft(activeSlide?.id)
    setMobileFeedbackName(pendingDraft?.reviewerName ?? reviewerName)
    setMobileFeedbackComment(pendingDraft?.comment ?? '')
    setSubmitError(pendingDraft ? 'Unsaved feedback draft restored. Submit again when ready.' : null)
    setMobileFeedbackSheet({
      slideTitle: activeSlide?.title ?? null,
      slideId: activeSlide?.id ?? null,
      clipId: activeSlide?.clipId ?? null,
      clipTime,
      camName: camPreset?.name ?? currentCameraRef.current ?? null,
      versionId: publishedVersion?.id ?? null,
      versionLabel: vLabel,
    })
  }, [
    activePresetId,
    activeSlide,
    cameraPresets,
    currentTime,
    isPreviewingVersion,
    loadPendingFeedbackDraft,
    publishedVersion,
    reviewerName,
  ])

  const closeMobileFeedbackSheet = useCallback(() => {
    setMobileFeedbackSheet(null)
    setMobileFeedbackComment('')
    setSubmitError(null)
  }, [])

  const handleSubmitMobileFeedback = useCallback(async (nameArg, commentArg) => {
    if (isPreviewingVersion || !mobileFeedbackSheet) return
    const fallbackName = typeof nameArg === 'string' ? nameArg : mobileFeedbackName
    const fallbackComment = typeof commentArg === 'string' ? commentArg : mobileFeedbackComment
    const draftReviewerName = fallbackName.trim()
    const draftComment = fallbackComment.trim()
    if (!draftReviewerName || !draftComment) return

    setIsSubmitting(true)
    setSubmitError(null)
    savePendingFeedbackDraft(mobileFeedbackSheet.slideId, {
      reviewerName: draftReviewerName,
      comment: draftComment,
      mode: 'mobile',
    })
    try {
      await submitFeedback({
        project_id: projectId,
        presentation_version_id: mobileFeedbackSheet.versionId ?? null,
        guest_id: guestIdentity?.id ?? null,
        guest_token: guestIdentity?.guest_token ?? null,
        slide_id: mobileFeedbackSheet.slideId ?? null,
        clip_id: mobileFeedbackSheet.clipId ?? null,
        clip_time_seconds: mobileFeedbackSheet.clipTime ?? null,
        camera_snapshot_json: mobileFeedbackSheet.camName ? { name: mobileFeedbackSheet.camName } : null,
        annotation_json: null,
        reviewer_name: draftReviewerName,
        comment: draftComment,
        status: 'pending',
      })

      if (analyticsConsent === 'granted') safeLocalStorageSet(LS_NAME_KEY, draftReviewerName)
      setReviewerName(draftReviewerName)
      setReviewerNameLocked(analyticsConsent === 'granted')
      clearPendingFeedbackDraft(mobileFeedbackSheet.slideId)
      await refreshSlideFeedback(mobileFeedbackSheet.slideId)
      closeMobileFeedbackSheet()
    } catch (err) {
      const msg = String(err?.message ?? '')
      if (msg.includes("Could not find the table 'public.client_feedback_items'")) {
        setSubmitError("Feedback table missing. Run `supabase/presentation_versions_schema.sql` on this Supabase project.")
      } else {
        setSubmitError(msg || 'Failed to submit. Draft saved on this device; please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    LS_NAME_KEY,
    analyticsConsent,
    closeMobileFeedbackSheet,
    isPreviewingVersion,
    guestIdentity,
    savePendingFeedbackDraft,
    clearPendingFeedbackDraft,
    mobileFeedbackComment,
    mobileFeedbackName,
    mobileFeedbackSheet,
    projectId,
    refreshSlideFeedback,
  ])
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

  // ── Exit note focus mode on drag / scroll ─────────────────────────────────
  useEffect(() => {
    if (!noteFocusNote) return
    const el = stageViewportRef.current
    if (!el) return
    let startX = null, startY = null
    const onPointerDown = (e) => { startX = e.clientX; startY = e.clientY }
    const onPointerMove = (e) => {
      if (startX == null) return
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 18) exitNoteFocusMode()
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

  const handleSubmitFeedback = useCallback(async (draft = {}) => {
    if (isPreviewingVersion) return
    const draftReviewerName = (draft.reviewerName ?? reviewerName).trim()
    const draftComment = (draft.comment ?? comment).trim()
    if (!draftReviewerName || !draftComment) return
    setIsSubmitting(true)
    setSubmitError(null)
    savePendingFeedbackDraft(activeSlide?.id, {
      reviewerName: draftReviewerName,
      comment: draftComment,
      mode: 'desktop',
    })
    try {
      const canvas = stageViewportRef.current?.querySelector('canvas')
      const snapshot = annotation && canvas
        ? await captureFeedbackSnapshot(canvas, { projectId, slideId: activeSlide?.id })
        : null
      const annotationPayload = annotation ? { ...annotation, snapshot } : null

      await submitFeedback({
        project_id:              projectId,
        presentation_version_id: publishedVersion?.id ?? null,
        guest_id:                guestIdentity?.id ?? null,
        guest_token:             guestIdentity?.guest_token ?? null,
        slide_id:                activeSlide?.id ?? null,
        clip_id:                 activeSlide?.clipId ?? null,
        clip_time_seconds:       lockedCtx?.clipTime ?? null,
        camera_snapshot_json:    lockedCtx?.camName ? { name: lockedCtx.camName } : null,
        annotation_json:         annotationPayload,
        reviewer_name:           draftReviewerName,
        comment:                 draftComment,
        status:                  'pending',
      })
      if (analyticsConsent === 'granted') safeLocalStorageSet(LS_NAME_KEY, draftReviewerName)
      setReviewerName(draftReviewerName)
      setReviewerNameLocked(analyticsConsent === 'granted')
      clearPendingFeedbackDraft(activeSlide?.id)
      await refreshSlideFeedback(activeSlide?.id)
      exitFeedbackMode()
    } catch (err) {
      const msg = String(err?.message ?? '')
      if (msg.includes("Could not find the table 'public.client_feedback_items'")) {
        setSubmitError("Feedback table missing. Run `supabase/presentation_versions_schema.sql` on this Supabase project.")
      } else {
        setSubmitError(msg || 'Failed to submit. Draft saved on this device; please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [reviewerName, comment, projectId, publishedVersion, activeSlide, lockedCtx, annotation, guestIdentity, savePendingFeedbackDraft, clearPendingFeedbackDraft, refreshSlideFeedback, exitFeedbackMode, isPreviewingVersion, analyticsConsent, LS_NAME_KEY])

  const handleUpdateClientFeedback = useCallback(async (item, patch) => {
    if (isPreviewingVersion) return
    const nextComment = patch.comment?.trim()
    if (!item?.id || !nextComment) return
    setSubmitError(null)
    try {
      const updated = await updateFeedback(item.id, { comment: nextComment }, { guestToken: guestIdentity?.guest_token })
      setPrevFeedback(prev => prev.map(f => f.id === item.id ? { ...f, ...updated } : f))
      setSlideFeedback(prev => prev.map(f => f.id === item.id ? { ...f, ...updated } : f))
    } catch (err) {
      setSubmitError(err?.message || 'Failed to update feedback.')
      throw err
    }
  }, [guestIdentity, isPreviewingVersion])

  const handleDeleteClientFeedback = useCallback(async (item) => {
    if (isPreviewingVersion) return
    if (!item?.id) return
    const label = item.comment ? `"${item.comment.slice(0, 80)}${item.comment.length > 80 ? '...' : ''}"` : 'this feedback'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setSubmitError(null)
    try {
      await deleteFeedback(item.id, { guestToken: guestIdentity?.guest_token })
      setPrevFeedback(prev => prev.filter(f => f.id !== item.id))
      setSlideFeedback(prev => prev.filter(f => f.id !== item.id))
    } catch (err) {
      setSubmitError(err?.message || 'Failed to delete feedback.')
      throw err
    }
  }, [guestIdentity, isPreviewingVersion])

  const handleHdriLoadError  = useCallback(() => {}, [])
  const handleClearAllHdri   = useCallback(() => { setCustomHdriUrl(null); setHdriPreset('none') }, [])

  // ── Early exits ───────────────────────────────────────────────────────────
  if (!gateConfirmed) {
    return (
      <GuestGate
        presentationId={projectId}
        isAdmin={isAdmin}
        onConfirmed={(guest) => {
          setGuestIdentity(guest || getStoredGuest(projectId))
          setGateConfirmed(true)
        }}
      />
    )
  }

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
    const commonMobileProps = {
      projectName,
      versionBadge: vBadge,
      previewVersion,
      isPreviewingVersion,
      sceneReady,
      progress,
      status,
      activeSlide,
      activeDuration,
      activeMobileTab,
      setActiveMobileTab,
      displayClips,
      slideFeedback,
      hasSnapshot,
      cameraPresets,
      activePresetId,
      noteFocusNote,
      mobileFeedbackSheet,
      mobileFeedbackInitialName: mobileFeedbackName,
      mobileFeedbackInitialComment: mobileFeedbackComment,
      viewportHeight: keyboardViewportHeight,
      reviewerNameLocked,
      isSubmitting,
      submitError,
      stageViewportRef,
      isPlaying,
      currentTime,
      isSwitchingClip,
      clipTransitionName,
      onPlayPause: isPlaying ? handlePause : handlePlay,
      onClipSelect: (id) => {
        if (hasSnapshot) activateSlide(id)
        else {
          const c = videoPlaylist.find(v => String(v.id) === String(id))
          if (c) activateRawClip(c)
        }
      },
      onCameraSelect: handleCameraPresetSelect,
      onOpenReference: openReferenceViewer,
      onOpenFeedback: openMobileFeedbackSheet,
      onCloseFeedback: closeMobileFeedbackSheet,
      onSubmitFeedback: handleSubmitMobileFeedback,
      onNoteClick: enterNoteFocusMode,
      referenceViewer,
      closeReferenceViewer,
      stepReferenceViewer,
      stageProps: {
        modelUrl,
        loadingManager: modelUrl ? loadingManager : null,
        videoElement,
        activeImageUrl,
        onLedMaterialStatus: () => {},
        sunPosition,
        sunIntensity,
        gridCellSize,
        modelLoaded: !!modelUrl,
        cameraControlsRef,
        cameraTargetPresetRef,
        cameraFlyDurationSeconds,
        hdriPreset,
        customHdriUrl,
        hdriFileExt,
        onHdriLoading: () => {},
        onHdriLoadError: handleHdriLoadError,
        onHdriClearRequest: handleClearAllHdri,
        envIntensity,
        bgBlur,
        showHdriBackground,
        bloomStrength,
        bloomThreshold,
        protectLed,
        transparentLedConfig,
        onImageTextureLoaded: handleImageTextureLoaded,
        freezeRenderLoop: !!noteFocusNote,
        // Re-fit the stage when the device rotates so it never stays zoomed-in.
        reframeKey: isLandscape ? 'landscape' : 'portrait',
      },
    }

    return (
      <>
      <MobileResponsiveShell
        {...commonMobileProps}
        landscape={isMobileLandscape}
        panelCollapsed={mobilePanelCollapsed}
        onTogglePanel={() => setMobilePanelCollapsed(v => !v)}
      />
      <ConsentBanner visible={consentUnset} onGrant={grantConsent} onDeny={denyConsent} />
      </>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%', height: '100dvh', background: T.bg, color: T.text,
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
            mediaByTarget={mediaByTarget}
            ledTargetMap={ledTargetMap}
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

          {!feedbackMode && !noteFocusNote && cameraPresets.length > 0 && (
            <ClientCameraPresetDock
              presets={cameraPresets}
              activePresetId={activePresetId}
              onSelect={handleCameraPresetSelect}
            />
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
            onOpenReference={(refs, index) => openReferenceViewer(refs, index)}
            projectName={projectName}
            readOnly={isPreviewingVersion}
          />
            )}
          </RightContextRail>
        )}
      </div>
      <ReferenceViewerModal
        viewer={referenceViewer}
        onClose={closeReferenceViewer}
        onStep={stepReferenceViewer}
      />
      <ConsentBanner visible={consentUnset} onGrant={grantConsent} onDeny={denyConsent} />
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
function ClientTopBar({ projectName, versionBadge, publishedAt, slideCount, activeSlideIndex, readOnly = false }) {
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

      {readOnly && (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '3px 9px', borderRadius: 5,
          fontSize: 10, fontWeight: 700,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: T.text3,
        }}>
          Preview only
        </span>
      )}
    </div>
  )
}

// ── Clip strip ────────────────────────────────────────────────────────────────
function VersionPreviewBanner({ version }) {
  if (!version) return null
  const isPublishedPreview = version.status === 'published'
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
      {isPublishedPreview
        ? `Previewing current published version v${version.version_number}`
        : `Previewing v${version.version_number} (${version.status}) - not the live published version`}
    </div>
  )
}

function ClipStrip({ clips, activeId, onSelect, disabled = false }) {
  if (!clips.length) return null
  return (
    <div style={{
      height: 58, background: 'rgba(6,4,3,0.86)', borderBottom: `1px solid rgba(220,100,30,0.16)`,
      display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
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
              padding: '5px 9px', borderRadius: 7, flexShrink: 0, cursor: disabled ? 'not-allowed' : 'pointer',
              background: isActive ? 'rgba(232,83,26,0.10)' : 'rgba(255,255,255,0.025)',
              border: `1px solid ${isActive ? 'rgba(232,83,26,0.78)' : 'rgba(220,100,30,0.10)'}`,
              boxShadow: isActive ? '0 0 10px rgba(232,83,26,0.16)' : 'none',
              transition: 'all 0.15s',
              outline: 'none',
              opacity: disabled ? 0.55 : 1,
            }}
          >
            <ClipThumbnail src={clip.thumbnailUrl || clip.thumbnail_url} active={isActive} width={40} height={26} radius={5} />
            <Col gap={1} style={{ textAlign: 'left' }}>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 700 : 500,
                color: isActive ? T.text : T.text2,
                whiteSpace: 'nowrap', maxWidth: 112, overflow: 'hidden', textOverflow: 'ellipsis',
                display: 'block',
              }}>
                {clip.title || clip.name || `Clip ${idx + 1}`}
              </span>
              <span style={{ fontSize: 8, color: T.text3 }}>
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

function StageTitleBadge({ title, compact = false }) {
  return (
    <div style={{
      position: 'absolute',
      top: compact ? 2 : 14,
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: compact ? 'min(360px, calc(100% - 32px))' : 'min(520px, calc(100% - 48px))',
      minWidth: compact ? 160 : 220,
      padding: compact ? '5px 12px' : '7px 18px',
      borderRadius: compact ? 6 : 7,
      background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
      border: `1px solid ${T.ember2}`,
      color: '#140600',
      boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.28)`,
      fontSize: compact ? 10 : 13,
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
      width: collapsed ? 40 : 304,
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
      contentLength: blob.size,
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

function ContextPanel({ slide, feedbackItems = [], onCollapse, onLeaveFeedback, onUpdateFeedback, onDeleteFeedback, onNoteClick, onOpenReference, projectName, readOnly = false }) {
  return (
    <div style={{
      width: 304, flexShrink: 0,
      background: 'rgba(8,6,4,0.88)', backdropFilter: 'blur(14px)',
      borderLeft: `1px solid rgba(220,100,30,0.16)`,
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
                  {visibleRefs.map((ref, index) => (
                    <RefThumb
                      key={ref.id}
                      caption={ref.caption}
                      url={ref.url}
                      onOpen={() => onOpenReference?.(visibleRefs, index)}
                    />
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
            width: '100%', padding: '10px', borderRadius: 7,
            fontFamily: 'Chakra Petch, sans-serif', fontSize: 12, fontWeight: 700,
            background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
            border: `1px solid ${T.ember2}`, color: 'white', cursor: 'pointer',
            boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          }}>
            Leave Feedback
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
        width: 40, flexShrink: 0,
        background: 'rgba(8,6,4,0.70)', backdropFilter: 'blur(14px)',
        borderLeft: `1px solid rgba(220,100,30,0.14)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0', gap: 12, cursor: 'pointer',
      }}
    >
      <span style={{
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: T.ember2,
      }}>Context</span>
      <span style={{
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        fontSize: 9, fontWeight: 600, color: T.text3, letterSpacing: '0.06em',
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

function ClientCameraPresetDock({ presets = [], activePresetId, onSelect }) {
  return (
    <div style={{
      position: 'absolute',
      left: 14,
      bottom: 48,
      zIndex: 18,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 7,
      maxWidth: 'calc(100% - 180px)',
    }}>
      <span style={{
        fontFamily: 'Chakra Petch, sans-serif',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: T.text3,
        paddingLeft: 1,
        textShadow: '0 1px 10px rgba(0,0,0,0.7)',
      }}>
        Camera presets
      </span>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        maxWidth: '100%',
        padding: 3,
        borderRadius: 999,
        background: 'rgba(20,20,20,0.78)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
        overflowX: 'auto',
      }}>
        {presets.map((preset, index) => {
          const active = String(activePresetId) === String(preset.id)
          return (
            <button
              key={preset.id ?? preset.name ?? index}
              type="button"
              onClick={() => onSelect(preset)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 27,
                minWidth: 74,
                padding: '6px 15px',
                borderRadius: 999,
                fontFamily: 'Chakra Petch, sans-serif',
                fontSize: 11,
                fontWeight: active ? 800 : 650,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                letterSpacing: 0,
                background: active ? `linear-gradient(180deg, ${T.ember2}, ${T.ember})` : 'transparent',
                border: 'none',
                color: active ? '#fff' : T.text3,
                boxShadow: active ? '0 0 16px rgba(232,83,26,0.28), inset 0 1px 0 rgba(255,255,255,0.22)' : 'none',
              }}
            >
              {preset.name || `View ${index + 1}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RefThumb({ caption, url, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!url || !onOpen}
      title={caption || 'Open reference'}
      style={{
        width: 88,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        textAlign: 'left',
        cursor: url && onOpen ? 'pointer' : 'default',
        fontFamily: 'Chakra Petch, sans-serif',
      }}
    >
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
    </button>
  )
}

function ReferenceViewerModal({ viewer, onClose, onStep }) {
  if (!viewer?.refs?.length) return null
  const ref = viewer.refs[viewer.index] ?? viewer.refs[0]
  const hasMultiple = viewer.refs.length > 1
  const caption = ref?.caption?.trim()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reference image viewer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'min(6vh, 48px) min(5vw, 56px)',
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(1120px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid rgba(220,100,30,0.32)`,
          borderRadius: 8,
          background: 'rgba(8,6,4,0.94)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 32px rgba(232,83,26,0.16)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          height: 42,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px 0 16px',
          borderBottom: `1px solid rgba(220,100,30,0.18)`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: T.ember2,
          }}>
            References
          </span>
          <span style={{ fontSize: 11, color: T.text3 }}>
            {viewer.index + 1} / {viewer.refs.length}
          </span>
          <Spacer />
          <button onClick={onClose} style={referenceViewerButtonStyle()} aria-label="Close reference viewer">x</button>
        </div>

        <div style={{
          position: 'relative',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020202',
        }}>
          {hasMultiple && (
            <button
              onClick={() => onStep(-1)}
              style={{ ...referenceViewerButtonStyle(true), left: 14 }}
              aria-label="Previous reference"
            >
              &lt;
            </button>
          )}
          <img
            src={ref.url}
            alt={caption || 'Reference'}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 190px)',
              objectFit: 'contain',
            }}
          />
          {hasMultiple && (
            <button
              onClick={() => onStep(1)}
              style={{ ...referenceViewerButtonStyle(true), right: 14 }}
              aria-label="Next reference"
            >
              &gt;
            </button>
          )}
        </div>

        <div style={{
          minHeight: 50,
          padding: '12px 16px 14px',
          borderTop: `1px solid rgba(220,100,30,0.18)`,
          flexShrink: 0,
        }}>
          <p style={{
            margin: 0,
            color: caption ? T.text : T.text3,
            fontSize: 13,
            lineHeight: 1.55,
          }}>
            {caption || 'No caption added.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function referenceViewerButtonStyle(floating = false) {
  return {
    position: floating ? 'absolute' : 'static',
    top: floating ? '50%' : 'auto',
    transform: floating ? 'translateY(-50%)' : 'none',
    width: floating ? 38 : 28,
    height: floating ? 52 : 28,
    borderRadius: 6,
    border: `1px solid rgba(220,100,30,0.28)`,
    background: 'rgba(8,6,4,0.78)',
    color: T.text,
    fontSize: floating ? 30 : 16,
    lineHeight: 1,
    fontFamily: 'Chakra Petch, sans-serif',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: floating ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
  }
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
  const canEdit = Boolean(onUpdateFeedback && onDeleteFeedback && item.can_edit === true)
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
            maxLength={2000}
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

// ── Privacy / analytics consent banner ────────────────────────────────────────
function ConsentBanner({ visible, onGrant, onDeny }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90,
      padding: '10px 16px calc(10px + env(safe-area-inset-bottom))',
      background: 'rgba(8,6,4,0.97)',
      borderTop: `1px solid ${T.border}`,
      display: 'flex', flexWrap: 'nowrap', gap: 12, alignItems: 'center',
      fontFamily: 'Chakra Petch, sans-serif',
    }}>
      <span style={{ fontSize: 12, lineHeight: 1.45, flex: '1 1 0', minWidth: 0, color: T.text2 }}>
        Trang này dùng cookies để ghi nhớ tên của bạn và đo lượt xem ẩn danh, giúp bạn để lại feedback nhanh hơn.
      </span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <button
          onClick={onDeny}
          style={{
            padding: '6px 14px', borderRadius: 6, border: `1px solid ${T.border}`,
            background: 'transparent', color: T.text2, cursor: 'pointer',
            fontSize: 12, fontFamily: 'Chakra Petch, sans-serif', fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          Từ chối
        </button>
        <button
          onClick={onGrant}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none',
            background: T.ember, color: '#fff', cursor: 'pointer',
            fontSize: 12, fontFamily: 'Chakra Petch, sans-serif', fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Chấp nhận
        </button>
      </div>
    </div>
  )
}

// ── Mobile components ─────────────────────────────────────────────────────────
function MobileFontLinks() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    </>
  )
}

function MobileResponsiveShell(props) {
  const landscape = Boolean(props.landscape)
  const panelVisible = !props.panelCollapsed
  return (
    <div style={{
      width: '100%', height: '100dvh', background: T.bg, color: T.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
    }}>
      <MobileFontLinks />
      <BrandedLoadingScreen isLoaded={props.sceneReady} progress={props.progress} status={props.status} />
      <MobileTopBar
        compact={landscape}
        projectName={props.projectName}
        versionBadge={props.versionBadge}
        slideCount={props.displayClips.length}
        activeSlideIndex={props.displayClips.findIndex(s => s.id === props.activeSlide?.id)}
      />
      {props.isPreviewingVersion && <VersionPreviewBanner version={props.previewVersion} />}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: landscape ? 'row' : 'column',
      }}>
        <div style={{
          flex: '1 1 auto',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <MobileStageViewport {...props} />
        </div>

        {props.panelCollapsed ? (
          landscape ? (
            <button onClick={props.onTogglePanel} style={mobilePanelRailStyle()} aria-label="Show details panel">
              <span style={mobilePanelRailLabelStyle()}>Show</span>
            </button>
          ) : (
            <button onClick={props.onTogglePanel} style={mobilePanelShowBarStyle()} aria-label="Show details panel">
              Show details ▲
            </button>
          )
        ) : (
          <div style={{
            width: landscape ? 'clamp(280px, 30vw, 340px)' : '100%',
            maxHeight: landscape ? 'none' : '44dvh',
            flex: landscape ? '0 0 auto' : '0 0 auto',
            borderLeft: landscape ? `1px solid ${T.border}` : 'none',
            borderTop: landscape ? 'none' : `1px solid ${T.border}`,
            background: 'rgba(8,6,4,0.96)',
            display: panelVisible ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            <button onClick={props.onTogglePanel} style={mobilePanelCollapseButtonStyle()}>
              {landscape ? 'Hide Panel' : 'Hide details ▼'}
            </button>
            <MobileBottomTabBar
              activeTab={props.activeMobileTab}
              onTabChange={props.setActiveMobileTab}
              clipCount={props.displayClips.length}
              feedbackCount={props.slideFeedback.length}
              refCount={(props.activeSlide?.references ?? []).filter(r => r.visibleToClient).length}
            />
            <MobileTabPanel {...props} landscape={landscape} />
          </div>
        )}
      </div>
      <MobileFeedbackSheet {...props} landscape={landscape} />
      <ReferenceViewerModal
        viewer={props.referenceViewer}
        onClose={props.closeReferenceViewer}
        onStep={props.stepReferenceViewer}
      />
    </div>
  )
}

function MobilePortraitShell(props) {
  return (
    <div style={{
      width: '100%', height: '100dvh', background: T.bg, color: T.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
    }}>
      <MobileFontLinks />
      <BrandedLoadingScreen isLoaded={props.sceneReady} progress={props.progress} status={props.status} />
      <MobileTopBar
        projectName={props.projectName}
        versionBadge={props.versionBadge}
        slideCount={props.displayClips.length}
        activeSlideIndex={props.displayClips.findIndex(s => s.id === props.activeSlide?.id)}
      />
      {props.isPreviewingVersion && <VersionPreviewBanner version={props.previewVersion} />}
      <MobileStageViewport {...props} />
      <MobileBottomTabBar
        activeTab={props.activeMobileTab}
        onTabChange={props.setActiveMobileTab}
        clipCount={props.displayClips.length}
        feedbackCount={props.slideFeedback.length}
        refCount={(props.activeSlide?.references ?? []).filter(r => r.visibleToClient).length}
      />
      <MobileTabPanel {...props} />
      <MobileFeedbackSheet {...props} />
      <ReferenceViewerModal
        viewer={props.referenceViewer}
        onClose={props.closeReferenceViewer}
        onStep={props.stepReferenceViewer}
      />
    </div>
  )
}

function MobileLandscapeShell(props) {
  return (
    <div style={{
      width: '100%', height: '100dvh', background: T.bg, color: T.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'Chakra Petch, sans-serif', position: 'relative',
    }}>
      <MobileFontLinks />
      <BrandedLoadingScreen isLoaded={props.sceneReady} progress={props.progress} status={props.status} />
      <MobileTopBar
        compact
        projectName={props.projectName}
        versionBadge={props.versionBadge}
        slideCount={props.displayClips.length}
        activeSlideIndex={props.displayClips.findIndex(s => s.id === props.activeSlide?.id)}
      />
      {props.isPreviewingVersion && <VersionPreviewBanner version={props.previewVersion} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <MobileStageViewport {...props} />
        </div>
        {props.panelCollapsed ? (
          <button onClick={props.onTogglePanel} style={mobilePanelRailStyle()} aria-label="Show details panel">
            <span style={mobilePanelRailLabelStyle()}>Show</span>
          </button>
        ) : (
          <aside style={{
            width: 'clamp(280px, 30vw, 340px)',
            flexShrink: 0,
            borderLeft: `1px solid ${T.border}`,
            background: 'rgba(8,6,4,0.96)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
            <button onClick={props.onTogglePanel} style={mobilePanelCollapseButtonStyle()}>Hide Panel</button>
            <MobileBottomTabBar
              activeTab={props.activeMobileTab}
              onTabChange={props.setActiveMobileTab}
              clipCount={props.displayClips.length}
              feedbackCount={props.slideFeedback.length}
              refCount={(props.activeSlide?.references ?? []).filter(r => r.visibleToClient).length}
            />
            <MobileTabPanel {...props} landscape />
          </aside>
        )}
      </div>
      <MobileFeedbackSheet {...props} landscape />
      <ReferenceViewerModal
        viewer={props.referenceViewer}
        onClose={props.closeReferenceViewer}
        onStep={props.stepReferenceViewer}
      />
    </div>
  )
}

function MobileStageViewport(props) {
  return (
    <div ref={props.stageViewportRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <StageCanvas {...props.stageProps} />
      {props.activeSlide?.title && <StageTitleBadge title={props.activeSlide.title} compact />}
      {!props.noteFocusNote && props.cameraPresets.length > 0 && (
        <MobileCameraPresetDock
          presets={props.cameraPresets}
          activePresetId={props.activePresetId}
          onSelect={props.onCameraSelect}
        />
      )}
      {props.noteFocusNote?.annotation && (
        <AnnotationLayer
          annotation={props.noteFocusNote.annotation}
          activeTool={null}
          onAnnotationChange={() => {}}
          readOnly
        />
      )}
      {props.noteFocusNote && (
        <StageLockBadge camName="Center" clipTime={props.noteFocusNote.clipTimeSeconds} />
      )}
      <MobileTransportBar
        isPlaying={props.isPlaying}
        currentTime={props.currentTime}
        activeDuration={props.activeDuration}
        onPlayPause={props.onPlayPause}
      />
      <NextSceneLoadingPopup show={props.sceneReady && props.isSwitchingClip} clipName={props.clipTransitionName} />
    </div>
  )
}

function MobileTransportBar({ isPlaying, currentTime, activeDuration, onPlayPause }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 36, background: 'rgba(5,4,3,0.92)', borderTop: `1px solid rgba(220,100,30,0.12)`,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
      zIndex: 12,
    }}>
      <button
        onClick={onPlayPause}
        style={{ background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontSize: 13 }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative' }}>
        <div style={{ width: `${activeDuration > 0 ? Math.min(100, (currentTime / activeDuration) * 100) : 0}%`, height: '100%', background: T.ember, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: T.text2, minWidth: 74, textAlign: 'right' }}>
        {formatDuration(currentTime)} / {formatDuration(activeDuration)}
      </span>
    </div>
  )
}

function MobileCameraPresetDock({ presets = [], activePresetId, onSelect }) {
  const visiblePresets = presets.slice(0, 3)
  if (!visiblePresets.length) return null
  return (
    <div style={{
      position: 'absolute', left: 10, bottom: 36, zIndex: 15,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      maxWidth: 'min(236px, calc(100% - 20px))',
      overflowX: 'auto',
      padding: 3,
      borderRadius: 999,
      background: 'rgba(12,10,9,0.82)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 8px 18px rgba(0,0,0,0.26)',
      backdropFilter: 'blur(10px)',
    }}>
      {visiblePresets.map((preset, index) => {
        const active = String(activePresetId) === String(preset.id)
        return (
          <button
            key={preset.id ?? preset.name ?? index}
            type="button"
            onClick={() => onSelect?.(preset)}
            style={{
              minHeight: 20,
              minWidth: 60,
              padding: '0 9px',
              borderRadius: 999,
              border: 'none',
              background: active ? `linear-gradient(180deg, ${T.ember2}, ${T.ember})` : 'transparent',
              color: active ? '#fff' : T.text3,
              fontSize: 8,
              fontWeight: active ? 800 : 700,
              fontFamily: 'Chakra Petch, sans-serif',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              boxShadow: active ? '0 0 10px rgba(232,83,26,0.22), inset 0 1px 0 rgba(255,255,255,0.18)' : 'none',
            }}
          >
            {preset.name || `View ${index + 1}`}
          </button>
        )
      })}
    </div>
  )
}

function MobileTabPanel(props) {
  return (
    <div style={{
      height: props.landscape ? '100%' : 220,
      minHeight: props.landscape ? 0 : 180,
      overflowY: 'auto',
      padding: '12px 14px calc(14px + env(safe-area-inset-bottom))',
      background: 'rgba(10,7,5,0.98)',
      borderTop: props.landscape ? 'none' : `1px solid ${T.border}`,
      flexShrink: 0,
    }}>
      {props.activeMobileTab === 'clips' && (
        <MobileClipList
          clips={props.displayClips}
          activeId={props.activeSlide?.id ?? null}
          onSelect={props.onClipSelect}
        />
      )}
      {props.activeMobileTab === 'context' && (
        <MobileContextContent
          slide={props.activeSlide}
          feedbackItems={props.slideFeedback}
          readOnly={props.isPreviewingVersion}
          onLeaveFeedback={props.onOpenFeedback}
          onNoteClick={props.onNoteClick}
        />
      )}
      {props.activeMobileTab === 'refs' && (
        <MobileReferencesContent
          slide={props.activeSlide}
          onOpenReference={props.onOpenReference}
        />
      )}
    </div>
  )
}

function MobileFeedbackSheet(props) {
  const isOpen = !!props.mobileFeedbackSheet
  const ctx = props.mobileFeedbackSheet
  const sheetKey = ctx ? `${ctx.slideId ?? ''}::${ctx.clipId ?? ''}::${ctx.versionId ?? ''}` : null
  const [name, setName] = useState(props.mobileFeedbackInitialName ?? '')
  const [comment, setComment] = useState(props.mobileFeedbackInitialComment ?? '')
  const lastKeyRef = useRef(null)
  useEffect(() => {
    if (!isOpen) { lastKeyRef.current = null; return }
    if (lastKeyRef.current === sheetKey) return
    lastKeyRef.current = sheetKey
    setName(props.mobileFeedbackInitialName ?? '')
    setComment(props.mobileFeedbackInitialComment ?? '')
  }, [isOpen, sheetKey, props.mobileFeedbackInitialName, props.mobileFeedbackInitialComment])
  if (!isOpen) return null
  const canSubmit = name.trim() && comment.trim() && !props.isSubmitting
  const sheetMaxHeight = props.viewportHeight
    ? (props.landscape ? `calc(${props.viewportHeight}px - 44px)` : `min(86dvh, calc(${props.viewportHeight}px - 12px))`)
    : (props.landscape ? 'calc(100dvh - 44px)' : '86dvh')
  return (
    <div style={{
      position: 'fixed',
      inset: props.landscape ? '44px 0 0 auto' : 'auto 0 0 0',
      width: props.landscape ? 'min(360px, 42vw)' : '100%',
      zIndex: 60,
      background: 'rgba(8,5,3,0.98)',
      borderTop: props.landscape ? 'none' : `1px solid ${T.border}`,
      borderLeft: props.landscape ? `1px solid ${T.border}` : 'none',
      boxShadow: props.landscape ? '-12px 0 30px rgba(0,0,0,0.45)' : '0 -12px 30px rgba(0,0,0,0.55)',
      padding: '14px 16px calc(16px + env(safe-area-inset-bottom))',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      maxHeight: sheetMaxHeight,
      overflowY: 'auto',
    }}>
      <Row gap={8}>
        <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Leave Feedback</span>
          <span style={{ fontSize: 10, color: T.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[ctx.slideTitle, ctx.camName, ctx.clipTime != null ? formatDuration(ctx.clipTime) : null, ctx.versionLabel].filter(Boolean).join(' - ')}
          </span>
        </Col>
        <button onClick={props.onCloseFeedback} style={mobileGhostButtonStyle()}>Cancel</button>
      </Row>
      <label style={mobileFieldLabelStyle()}>
        Your name
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter your name"
          maxLength={100}
          style={mobileInputStyle()}
        />
      </label>
      <label style={mobileFieldLabelStyle()}>
        Feedback
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Write objective feedback for this clip"
          maxLength={2000}
          rows={4}
          style={{ ...mobileInputStyle(), minHeight: 104, resize: 'vertical', lineHeight: 1.5 }}
        />
      </label>
      {props.submitError && (
        <span style={{ fontSize: 11, color: '#FF9B75', lineHeight: 1.45 }}>{props.submitError}</span>
      )}
      <button
        onClick={() => props.onSubmitFeedback(name, comment)}
        disabled={!canSubmit}
        style={mobilePrimaryButtonStyle(Boolean(canSubmit))}
      >
        {props.isSubmitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  )
}

function mobilePanelRailStyle() {
  return {
    width: 48,
    flexShrink: 0,
    border: 'none',
    borderLeft: `1px solid ${T.border}`,
    background: 'rgba(8,6,4,0.96)',
    color: T.ember2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  }
}

function mobilePanelRailLabelStyle() {
  return {
    display: 'block',
    transform: 'rotate(-90deg)',
    whiteSpace: 'nowrap',
    transformOrigin: 'center',
  }
}

function mobilePanelCollapseButtonStyle() {
  return {
    height: 32,
    flexShrink: 0,
    border: 'none',
    borderBottom: `1px solid rgba(220,100,30,0.14)`,
    background: 'rgba(255,255,255,0.03)',
    color: T.text3,
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function mobilePanelShowBarStyle() {
  return {
    height: 34,
    flexShrink: 0,
    width: '100%',
    border: 'none',
    borderTop: `1px solid ${T.border}`,
    background: 'rgba(8,6,4,0.96)',
    color: T.ember2,
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  }
}

function mobileFieldLabelStyle() {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: T.text3,
  }
}

function mobileInputStyle() {
  return {
    minHeight: 42,
    width: '100%',
    borderRadius: 7,
    border: `1px solid ${T.border}`,
    background: 'rgba(0,0,0,0.35)',
    color: T.text,
    padding: '9px 10px',
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 13,
    outline: 'none',
  }
}

function mobileGhostButtonStyle() {
  return {
    minHeight: 34,
    padding: '0 10px',
    borderRadius: 6,
    border: `1px solid ${T.border}`,
    background: T.glass,
    color: T.text2,
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function mobilePrimaryButtonStyle(enabled) {
  return {
    minHeight: 42,
    borderRadius: 7,
    border: `1px solid ${enabled ? T.ember2 : 'rgba(255,255,255,0.08)'}`,
    background: enabled ? `linear-gradient(180deg, ${T.ember2}, ${T.ember})` : 'rgba(255,255,255,0.04)',
    color: enabled ? '#fff' : T.text4,
    fontFamily: 'Chakra Petch, sans-serif',
    fontSize: 12,
    fontWeight: 800,
    cursor: enabled ? 'pointer' : 'not-allowed',
    boxShadow: enabled ? T.emberGlow : 'none',
  }
}

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

function MobileContextContent({ slide, feedbackItems = [], readOnly = false, onLeaveFeedback, onNoteClick }) {
  const notes = (slide?.directorNotes ?? []).filter(n => n.visibleToClient && n.text?.trim())
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
      {notes.length > 0 && (
        <Col gap={7}>
          <SectionLabel>Director's Notes</SectionLabel>
          {notes.map(note => (
            <button
              key={note.id}
              type="button"
              onClick={note.annotation ? () => onNoteClick?.(note) : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                borderRadius: 7,
                border: `1px solid ${note.annotation ? 'rgba(232,83,26,0.35)' : 'rgba(232,83,26,0.18)'}`,
                background: 'rgba(232,83,26,0.075)',
                color: T.text,
                padding: '11px 12px',
                fontFamily: 'Chakra Petch, sans-serif',
                cursor: note.annotation ? 'pointer' : 'default',
              }}
            >
              {note.annotation && (
                <span style={{ display: 'block', marginBottom: 5, color: T.ember2, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>
                  Annotated
                </span>
              )}
              <span style={{ fontSize: 13, lineHeight: 1.55 }}>{note.text}</span>
            </button>
          ))}
        </Col>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={onLeaveFeedback}
          disabled={!onLeaveFeedback}
          style={mobilePrimaryButtonStyle(Boolean(onLeaveFeedback))}
        >
          Leave Feedback
        </button>
      )}
      <FeedbackHistoryList items={feedbackItems} />
    </Col>
  )
}

function MobileReferencesContent({ slide, onOpenReference }) {
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
      {refs.map((ref, index) => (
        <RefThumb
          key={ref.id}
          caption={ref.caption}
          url={ref.url}
          onOpen={() => onOpenReference?.(refs, index)}
        />
      ))}
    </div>
  )
}

function NextSceneLoadingPopup({ show, clipName }) {
  if (!show) return null

  return (
    <div className="fixed left-1/2 bottom-16 z-40 pointer-events-none flex -translate-x-1/2 px-4">
      <div className="min-w-[250px] max-w-[min(340px,calc(100vw-2rem))] rounded-lg border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border border-[#FF5F1F]/20" />
            <div className="absolute inset-1 rounded-full border-2 border-white/10 border-t-[#FF5F1F] animate-spin" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF5F1F]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF5F1F]">
              Loading next scene
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-white/85">
              {clipName || 'Preparing visual'}
            </p>
            <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/10">
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

function findClipForSlide(slide, playlist, slideIndex = -1) {
  if (!slide || !Array.isArray(playlist)) return null
  return playlist.find(c =>
    String(c.id) === String(slide.clipId) ||
    c.name === slide.clipId ||
    c.name === slide.title ||
    c.url === slide.clipUrl
  ) ?? playlist[slideIndex] ?? null
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

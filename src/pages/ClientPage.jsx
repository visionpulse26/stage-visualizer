import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import { useSecurityLockdown } from '../hooks/useSecurityLockdown'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'
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
import { loadPublishedVersion } from '../lib/presentationVersions'

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

// ── ClientPage ────────────────────────────────────────────────────────────────
function ClientPage() {
  const { projectId } = useParams()
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
  const videoRef = useRef(null)

  // ── Presentation snapshot ─────────────────────────────────────────────────
  const [presentationSlides,   setPresentationSlides]   = useState([])  // from snapshot_json
  const [publishedVersion,     setPublishedVersion]     = useState(null)
  const [activeSlideId,        setActiveSlideId]        = useState(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [contextCollapsed, setContextCollapsed] = useState(false)

  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()
  useProjectStats(projectId, 'client')
  const { startClipWatch } = useClientSessionTracking(projectId)
  const currentCameraRef = useRef(null)

  const sceneReady = !isDbLoading && !!modelUrl && stageLoaded

  // Active slide (from snapshot) or null
  const activeSlide = useMemo(
    () => presentationSlides.find(s => s.id === activeSlideId) ?? presentationSlides[0] ?? null,
    [presentationSlides, activeSlideId],
  )

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
  }, [])

  useEffect(() => { resetStageLoading() }, [projectId, resetStageLoading])

  // ── Video activation ──────────────────────────────────────────────────────
  const activateVideo = useCallback((id, url) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    const v = document.createElement('video')
    v.src = url; v.crossOrigin = 'anonymous'; v.loop = true
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.addEventListener('loadeddata', () => {
      v.play().catch(() => {})
      videoRef.current = v
      setVideoElement(v); setVideoLoaded(true); setActiveVideoId(id); setIsPlaying(true)
    })
    v.load()
  }, [])

  // ── Load project ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function fetchProject() {
      revokeAllBlobs()
      setIsDbLoading(true); setProjectNotFound(false)

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

        // Try to load published presentation snapshot first
        let snapshotSlides = []
        try {
          const pv = await loadPublishedVersion(projectId)
          if (!cancelled && pv?.snapshot_json?.slides?.length) {
            setPublishedVersion(pv)
            snapshotSlides = pv.snapshot_json.slides.filter(s => !s.hiddenFromClient)
            setPresentationSlides(snapshotSlides)
            if (snapshotSlides[0]) setActiveSlideId(snapshotSlides[0].id)
            // Override camera presets from snapshot if available
            if (pv.snapshot_json.cameraPresets?.length) {
              setCameraPresets(pv.snapshot_json.cameraPresets)
            }
          }
        } catch {
          // No published version yet — fall through to raw playlist
        }

        // Load media playlist (blob URLs)
        const isRemote = (u) => u && (u.startsWith('http://') || u.startsWith('https://'))
        const loadPlaylist = async (items) => {
          const out = []
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            let url = item.url
            if (isRemote(url)) {
              try { const b = await fetchAsBlobUrlWithCache(url); addBlob(b); url = b } catch {}
            }
            out.push({ id: Date.now() + i, name: item.name, url, type: item.type })
          }
          return out
        }

        if (data.media_playlist?.length) {
          const restored = await loadPlaylist(data.media_playlist)
          if (!cancelled) {
            setVideoPlaylist(restored)
            const first = restored[0]
            startClipWatch?.(first?.name || 'Unknown')
            if (first?.type === 'image') {
              setActiveImageUrl(first.url); setActiveVideoId(first.id)
              setVideoLoaded(true)
            } else if (first) {
              activateVideo(first.id, first.url)
            }
          }
        } else if (data.video_url) {
          let url = data.video_url
          if (isRemote(url)) {
            try { const b = await fetchAsBlobUrlWithCache(url); addBlob(b); url = b } catch {}
          }
          const id = Date.now()
          startClipWatch?.('Published Video')
          setVideoPlaylist([{ id, name: 'Published Video', type: 'video', url }])
          activateVideo(id, url)
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
            if (isRemote(hdriSrc)) {
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
  }, [projectId, activateVideo, addBlob, revokeAllBlobs, startClipWatch])

  // ── Apply client zoom guard once stage is ready ───────────────────────────
  useEffect(() => {
    if (!sceneReady) return
    const controls = cameraControlsRef?.current
    if (!controls) return
    controls.minDistance = CLIENT_MIN_DISTANCE
    controls.maxDistance = CLIENT_MAX_DISTANCE
  }, [sceneReady])

  // ── Activate slide → switch clip + camera ─────────────────────────────────
  const activateSlide = useCallback((slideId) => {
    setActiveSlideId(slideId)
    const slide = presentationSlides.find(s => s.id === slideId)
    if (!slide) return

    // Switch clip
    const clip = videoPlaylist.find(c =>
      String(c.id) === String(slide.clipId) || c.name === slide.clipId
    ) ?? videoPlaylist[presentationSlides.indexOf(slide)]

    if (clip) {
      recordClientInteraction(projectId, 'clip_play', clip.name || 'Unknown')
      startClipWatch?.(clip.name || 'Unknown')
      if (clip.type === 'image') {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current = null }
        setVideoElement(null); setActiveImageUrl(clip.url)
        setActiveVideoId(clip.id); setVideoLoaded(true); setIsPlaying(false)
      } else {
        setActiveImageUrl(null); activateVideo(clip.id, clip.url)
      }
    }

    // Switch default camera
    if (slide.defaultCameraPresetId) {
      setActivePresetId(slide.defaultCameraPresetId)
      setCameraTargetPreset(cameraTargetPresetRef, slide.defaultCameraPresetId)
      recordClientInteraction(projectId, 'camera_change', slide.defaultCameraPresetId)
    }
  }, [presentationSlides, videoPlaylist, projectId, activateVideo, startClipWatch])

  // If no presentation snapshot, fall back to raw playlist clip switching
  const activateRawClip = useCallback((clip) => {
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

  const handleCameraSelect = useCallback((presetId) => {
    setActivePresetId(presetId)
    const preset = cameraPresets.find(p => p.id === presetId)
    setCameraTargetPreset(cameraTargetPresetRef, presetId)
    recordClientInteraction(projectId, 'camera_change', preset?.name || 'Unknown')
    currentCameraRef.current = preset?.name || null
  }, [cameraPresets, projectId])

  const handlePlay  = useCallback(() => { videoRef.current?.play().catch(() => {}); setIsPlaying(true) }, [])
  const handlePause = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])

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
    ? `v${publishedVersion.version_number}`
    : (versionStatus || null)

  const activeCamName = cameraPresets.find(p => p.id === activePresetId)?.name ?? null

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
      <ClientTopBar
        projectName={projectName}
        versionBadge={vBadge}
        publishedAt={publishedVersion?.published_at}
        slideCount={displayClips.length}
        activeSlideIndex={displayClips.findIndex(s => s.id === (activeSlide?.id ?? displayClips[0]?.id))}
      />

      {/* ── Clip strip ── */}
      <ClipStrip
        clips={displayClips}
        activeId={activeSlide?.id ?? null}
        onSelect={hasSnapshot ? activateSlide : (id) => {
          const c = videoPlaylist.find(v => String(v.id) === String(id))
          if (c) activateRawClip(c)
        }}
      />

      {/* ── Main area: Stage + Right panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* Stage */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
          />

          {/* Camera badge */}
          {activeCamName && (
            <div style={{
              position: 'absolute', top: 10, left: 12, pointerEvents: 'none',
              background: T.camDim, border: '1px solid rgba(31,160,238,0.35)',
              borderRadius: 4, padding: '2px 7px',
              fontSize: 9, color: T.cam, fontWeight: 600, letterSpacing: '0.08em',
              boxShadow: T.camGlow,
            }}>
              ● CAM: {activeCamName}
            </div>
          )}

          {/* Camera preset pills */}
          {cameraPresets.length > 0 && (
            <div style={{ position: 'absolute', top: 10, right: 14, display: 'flex', gap: 5 }}>
              {cameraPresets.map(p => (
                <CamPill key={p.id} label={p.name} active={activePresetId === p.id}
                  onClick={() => handleCameraSelect(p.id)} />
              ))}
            </div>
          )}

          {/* Transport bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 38, background: 'rgba(5,4,3,0.95)', borderTop: `1px solid rgba(220,100,30,0.14)`,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          }}>
            <button onClick={isPlaying ? handlePause : handlePlay}
              style={{ background: 'none', border: 'none', color: isPlaying ? T.text2 : T.text, cursor: 'pointer', fontSize: 13 }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
              <div style={{ width: '0%', height: '100%', background: T.ember, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: T.text2 }}>
              {activeSlide?.title
                ? activeSlide.title
                : activeClipRaw?.name ?? '—'}
            </span>
          </div>
        </div>

        {/* ── Right context panel ── */}
        {contextCollapsed ? (
          <CollapsedHandle
            clipTitle={activeSlide?.title ?? activeClipRaw?.name ?? '—'}
            feedbackCount={0}
            onExpand={() => setContextCollapsed(false)}
          />
        ) : (
          <ContextPanel
            slide={activeSlide}
            cameraPresets={cameraPresets}
            activePresetId={activePresetId}
            onCameraSelect={handleCameraSelect}
            onCollapse={() => setContextCollapsed(true)}
          />
        )}
      </div>

      <GlobalFooter projectName={projectName} />
    </div>
  )
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function ClientTopBar({ projectName, versionBadge, publishedAt, slideCount, activeSlideIndex }) {
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

      {/* Leave Feedback — wired in Phase 3 */}
      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 13px', borderRadius: 6,
        fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
        background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
        border: `1px solid ${T.ember2}`, color: 'white',
        boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        opacity: 0.5, // dimmed until Phase 3 wires it
        pointerEvents: 'none',
      }}>
        ✦ Leave Feedback
      </button>
    </div>
  )
}

// ── Clip strip ────────────────────────────────────────────────────────────────
function ClipStrip({ clips, activeId, onSelect }) {
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
            onClick={() => onSelect(clip.id)}
            style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '6px 10px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
              background: isActive ? 'rgba(232,83,26,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isActive ? T.ember : 'rgba(220,100,30,0.12)'}`,
              boxShadow: isActive ? '0 0 12px rgba(232,83,26,0.2)' : 'none',
              transition: 'all 0.15s',
              outline: 'none',
            }}
          >
            {/* Thumbnail */}
            <div style={{
              width: 46, height: 30, borderRadius: 5, flexShrink: 0,
              background: '#1a1410',
              backgroundImage: 'repeating-linear-gradient(135deg, #1a1410 0px, #1a1410 3px, #201810 3px, #201810 9px)',
              border: `1px solid ${isActive ? T.ember : 'rgba(220,100,30,0.12)'}`,
              boxShadow: isActive ? '0 0 8px rgba(232,83,26,0.25)' : 'none',
            }} />
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
function ContextPanel({ slide, cameraPresets, activePresetId, onCameraSelect, onCollapse }) {
  return (
    <div style={{
      width: 268, flexShrink: 0,
      background: T.glassDark, backdropFilter: 'blur(14px)',
      borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '9px 12px', borderBottom: `1px solid rgba(220,100,30,0.12)`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <Col gap={1} style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slide?.title || '—'}
          </span>
          {slide?.subtitle && (
            <span style={{ fontSize: 10, color: T.text2 }}>{slide.subtitle}</span>
          )}
        </Col>
        <button onClick={onCollapse} style={{
          background: T.glass, border: `1px solid ${T.border}`, borderRadius: 5,
          color: T.text3, cursor: 'pointer', padding: '4px 6px', fontSize: 10, flexShrink: 0,
        }}>⟩</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <Col gap={14}>

          {/* Camera presets */}
          {cameraPresets.length > 0 && (
            <Col gap={5}>
              <SectionLabel>Camera</SectionLabel>
              <Row gap={5} style={{ flexWrap: 'wrap' }}>
                {cameraPresets.map(p => (
                  <CamPill key={p.id} label={p.name}
                    active={activePresetId === p.id}
                    onClick={() => onCameraSelect(p.id)} />
                ))}
              </Row>
            </Col>
          )}

          {/* Director's note */}
          {slide?.directorNoteVisible && slide?.directorNote && (
            <Col gap={5}>
              <SectionLabel>Director's Note</SectionLabel>
              <p style={{
                fontSize: 12, color: T.text2, lineHeight: 1.65, margin: 0,
                background: 'rgba(0,0,0,0.2)', border: `1px solid rgba(220,100,30,0.1)`,
                borderRadius: 7, padding: '10px 11px',
              }}>
                {slide.directorNote}
              </p>
            </Col>
          )}

          {/* References */}
          {(() => {
            const visibleRefs = (slide?.references ?? []).filter(r => r.visibleToClient)
            if (!visibleRefs.length) return null
            return (
              <Col gap={6}>
                <SectionLabel>References ({visibleRefs.length})</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {visibleRefs.map(ref => (
                    <RefThumb key={ref.id} caption={ref.caption} url={ref.url} />
                  ))}
                </div>
              </Col>
            )
          })()}

          {/* No content fallback */}
          {!slide && (
            <span style={{ fontSize: 11, color: T.text4, textAlign: 'center', display: 'block', paddingTop: 24 }}>
              Select a clip to view context
            </span>
          )}
        </Col>
      </div>

      {/* Leave Feedback CTA — Phase 3 */}
      <div style={{ padding: '12px', borderTop: `1px solid rgba(220,100,30,0.1)`, flexShrink: 0 }}>
        <button style={{
          width: '100%', padding: '8px', borderRadius: 7,
          fontFamily: 'Chakra Petch, sans-serif', fontSize: 11, fontWeight: 600,
          background: `linear-gradient(180deg, ${T.ember2}, ${T.ember})`,
          border: `1px solid ${T.ember2}`, color: 'white', cursor: 'pointer',
          boxShadow: `${T.emberGlow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          opacity: 0.5, pointerEvents: 'none', // enabled in Phase 3
        }}>
          ✦ Leave Feedback
        </button>
      </div>
    </div>
  )
}

// ── Collapsed handle ──────────────────────────────────────────────────────────
function CollapsedHandle({ clipTitle, feedbackCount, onExpand }) {
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
        fontSize: 10, color: T.text2, letterSpacing: '0.08em',
        maxHeight: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
    </div>
  )
}

// ── Tiny primitives ───────────────────────────────────────────────────────────
function CamPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 6,
      fontFamily: 'Chakra Petch, sans-serif', fontSize: 10,
      fontWeight: active ? 600 : 500, cursor: 'pointer',
      background: active ? T.camDim : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? T.cam : 'rgba(255,255,255,0.1)'}`,
      color: active ? T.cam : T.text3,
      boxShadow: active ? T.camGlow : 'none',
    }}>{label}</button>
  )
}

function SectionLabel({ children }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: T.text3,
    }}>{children}</span>
  )
}

function RefThumb({ caption, url }) {
  return (
    <div style={{ width: 80 }}>
      <div style={{
        width: 80, height: 52, borderRadius: 6,
        background: '#1a1410', border: `1px solid rgba(220,100,30,0.15)`,
        backgroundImage: url
          ? `url(${url})`
          : 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(220,100,30,0.05) 4px, rgba(220,100,30,0.05) 5px)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!url && <span style={{ fontSize: 8, color: T.text3 }}>ref</span>}
      </div>
      {caption && (
        <span style={{
          display: 'block', marginTop: 4, fontSize: 9, color: T.text2,
          textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{caption}</span>
      )}
    </div>
  )
}

// ── Error screens ─────────────────────────────────────────────────────────────
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

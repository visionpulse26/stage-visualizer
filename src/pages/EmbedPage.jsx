import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import StageCanvas from '../components/StageCanvas'
import BrandedLoadingScreen from '../components/BrandedLoadingScreen'
import { useSecurityLockdown } from '../hooks/useSecurityLockdown'
import { useStageLoading } from '../hooks/useStageLoading'
import { useBlobUrlCache } from '../hooks/useBlobUrlCache'
import { supabase } from '../lib/supabaseClient'
import { recordClientPageView } from '../lib/analyticsTracker'
import { fetchAsBlobUrlWithCache } from '../utils/secureAssetLoader'
import { resolvePlayableSrc } from '../utils/streamUrl'
import { setCameraTargetPreset } from '../utils/animateCameraToPreset'

/**
 * Public embed (P9): `/embed/:embedToken` — opaque token, no login.
 * Logged-in users still see admin preview chrome + iframe snippet sidebar.
 */
export default function EmbedPage() {
  const { embedToken: slug } = useParams()
  const navigate = useNavigate()
  useSecurityLockdown()

  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const isAdminPreview = !!session

  const {
    loadingManager,
    progress,
    status,
    loaded: stageLoaded,
    reset: resetStageLoading,
  } = useStageLoading()

  const { add: addBlob, revokeAll: revokeAllBlobs } = useBlobUrlCache()

  const [project, setProject] = useState(null)
  const [isDbLoading, setIsDbLoading] = useState(true)
  const [projectNotFound, setProjectNotFound] = useState(false)
  const [copied, setCopied] = useState(false)

  const [modelUrl, setModelUrl] = useState(null)
  const [videoElement, setVideoElement] = useState(null)
  const [activeImageUrl, setActiveImageUrl] = useState(null)
  const [cameraPresets, setCameraPresets] = useState([])
  const cameraControlsRef = useRef(null)
  const cameraTargetPresetRef = useRef(null)

  const [gridCellSize, setGridCellSize] = useState(1)
  const [cameraFlyDurationSeconds, setCameraFlyDurationSeconds] = useState(4)

  const [hdriPreset, setHdriPreset] = useState('none')
  const [customHdriUrl, setCustomHdriUrl] = useState(null)
  const [hdriFileExt, setHdriFileExt] = useState('hdr')
  const [hdriLoading, setHdriLoading] = useState(false)
  const [envIntensity, setEnvIntensity] = useState(1)
  const [bgBlur, setBgBlur] = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength, setBloomStrength] = useState(0.3)
  const [bloomThreshold, setBloomThreshold] = useState(1.2)
  const [protectLed, setProtectLed] = useState(true)
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
  const [sunPosition, setSunPosition] = useState([10.6, 10.6, 7.5])
  const [sunIntensity, setSunIntensity] = useState(1)

  const videoRef = useRef(null)

  const sceneReady =
    !isDbLoading && (modelUrl ? stageLoaded : true)

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
      }
    }
  }, [])

  useEffect(() => {
    resetStageLoading()
  }, [slug, resetStageLoading])

  const activateVideo = useCallback((_id, url) => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.setAttribute('muted', '')
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.loop = true
    v.preload = 'auto'
    v.src = url
    v.addEventListener('loadeddata', () => {
      v.play().catch(() => {})
      videoRef.current = v
      setVideoElement(v)
    })
    v.load()
  }, [])

  // Video streams from the media Worker (when configured); images keep the blob
  // loader. Falls back to blob for everything when streaming isn't deployed.
  const blobFallback = useCallback(async (u) => {
    const b = await fetchAsBlobUrlWithCache(u)
    addBlob(b)
    return b
  }, [addBlob])

  const loadMediaPlaylist = useCallback(
    async (items, projectId) => {
      const restored = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        let url = item.url
        try {
          url = await resolvePlayableSrc({ url: item.url, projectId, isVideo: item.type !== 'image', blobFallback })
        } catch {
          /* keep remote */
        }
        restored.push({ id: Date.now() + i, name: item.name, url, type: item.type })
      }
      return restored
    },
    [blobFallback]
  )

  useEffect(() => {
    if (!slug) {
      setIsDbLoading(false)
      setProjectNotFound(true)
      return
    }

    let cancelled = false

    async function fetchProject() {
      revokeAllBlobs()
      setIsDbLoading(true)
      setProjectNotFound(false)

      try {
        let data = null

        const byToken = await supabase
          .rpc('resolve_embed_project', { p_token: slug })

        if (cancelled) return
        data = Array.isArray(byToken.data) ? byToken.data[0] : byToken.data

        if (cancelled) return

        if (!data) {
          setProjectNotFound(true)
          setIsDbLoading(false)
          return
        }

        setProject(data)
        recordClientPageView(data.id)

        const isRemote = (u) =>
          u && (u.startsWith('http://') || u.startsWith('https://'))

        const modelSrc = data.stage_url
        setModelUrl(modelSrc || null)

        if (data.media_playlist && data.media_playlist.length > 0) {
          const restored = await loadMediaPlaylist(data.media_playlist, data.id)
          const first = restored[0]
          if (first?.type === 'image') {
            setActiveImageUrl(first.url)
          } else if (first) {
            activateVideo(first.id, first.url)
          }
        } else if (data.video_url) {
          let vidUrl = data.video_url
          try {
            vidUrl = await resolvePlayableSrc({ url: data.video_url, projectId: data.id, isVideo: true, blobFallback })
          } catch {
            /* use raw */
          }
          const id = Date.now()
          activateVideo(id, vidUrl)
        }

        setCameraPresets(data.camera_presets || [])
        if (data.grid_cell_size != null) setGridCellSize(data.grid_cell_size)

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

        const cfg = data.scene_config
        if (cfg) {
          setHdriPreset(cfg.hdriPreset ?? 'none')
          setEnvIntensity(cfg.envIntensity ?? 1)
          setBgBlur(cfg.bgBlur ?? 0)
          setShowHdriBackground(cfg.showHdriBackground ?? false)
          setBloomStrength(cfg.bloomStrength ?? 0.3)
          setBloomThreshold(cfg.bloomThreshold ?? 1.2)
          setProtectLed(cfg.protectLed ?? true)
          setTransparentLedConfig((prev) => ({
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
            const hdriSrc = cfg.customHdriUrl.replace(
              'visual.tooawake.online',
              'visual.tooawake.mov'
            )
            const basePath = hdriSrc.split('?')[0] || hdriSrc
            const rawExt = basePath.split('.').pop()?.toLowerCase() || 'hdr'
            setHdriFileExt(['hdr', 'exr'].includes(rawExt) ? rawExt : 'hdr')
            if (isRemote(hdriSrc)) {
              fetchAsBlobUrlWithCache(hdriSrc)
                .then((blobUrl) => {
                  if (!cancelled) {
                    addBlob(blobUrl)
                    setCustomHdriUrl(blobUrl)
                  }
                })
                .catch(() => {
                  if (!cancelled) setCustomHdriUrl(hdriSrc)
                })
            } else {
              setCustomHdriUrl(hdriSrc)
            }
          } else {
            setHdriFileExt('hdr')
            setCustomHdriUrl(null)
          }
          if (cfg.cameraFlyDurationSeconds != null) {
            setCameraFlyDurationSeconds(cfg.cameraFlyDurationSeconds)
          }
        }
      } catch {
        if (!cancelled) setProjectNotFound(true)
      } finally {
        if (!cancelled) setIsDbLoading(false)
      }
    }

    fetchProject()
    return () => {
      cancelled = true
    }
  }, [slug, revokeAllBlobs, loadMediaPlaylist, activateVideo, addBlob])

  const handleHdriLoadError = useCallback(() => {
    setHdriLoading(false)
  }, [])

  const handleClearAllHdri = useCallback(() => {
    setCustomHdriUrl(null)
    setHdriPreset('none')
    setHdriLoading(false)
  }, [])

  const handleGoToView = useCallback((preset) => {
    setCameraTargetPreset(cameraTargetPresetRef, preset)
  }, [])

  const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin
  const embedUrl = `${baseUrl}/embed/${slug}`

  function copyEmbedCode() {
    const code = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500"\n  frameborder="0"\n  allow="fullscreen"\n  style="border-radius:8px"\n></iframe>`
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!slug) {
    return (
      <div className="w-full h-full min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <p className="text-red-400/80 text-sm">No embed token in URL.</p>
      </div>
    )
  }

  if (projectNotFound) {
    return (
      <div className="w-full h-full min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center space-y-3 px-4">
          <p className="text-white/50 text-sm">
            This embed link is invalid, disabled, or no longer available.
          </p>
          {isAdminPreview && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="text-white/30 hover:text-white/60 text-xs underline transition-colors"
            >
              Back to Admin
            </button>
          )}
        </div>
      </div>
    )
  }

  if (session === undefined || isDbLoading || !project) {
    return (
      <div className="w-full min-h-screen bg-[#0a0a0a]">
        <BrandedLoadingScreen isLoaded={false} progress={progress} status={status} />
      </div>
    )
  }

  const presetOverlay = (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
        <div className="flex flex-wrap gap-1.5 pointer-events-auto max-w-[85%]">
          {cameraPresets.slice(0, 6).map((p, i) => (
            <button
              key={p.id ?? i}
              type="button"
              onClick={() => handleGoToView(p)}
              className="px-2.5 py-1 rounded bg-black/50 border border-white/10 text-white/70 text-[10px] backdrop-blur-sm hover:bg-black/70 hover:text-white/90 transition-colors"
            >
              {p.name ?? `View ${i + 1}`}
            </button>
          ))}
        </div>
        <span
          className="text-white/25 text-[10px] tracking-widest hidden sm:inline"
          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
        >
          TOOAWAKE
        </span>
      </div>
    </div>
  )

  const stageTree = (
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
      envIntensity={envIntensity}
      bgBlur={bgBlur}
      showHdriBackground={showHdriBackground}
      bloomStrength={bloomStrength}
      bloomThreshold={bloomThreshold}
      protectLed={protectLed}
      transparentLedConfig={transparentLedConfig}
    >
      {presetOverlay}
    </StageCanvas>
  )

  // Anonymous iframe visitors: stage only (no admin chrome)
  if (session === null) {
    return (
      <div className="w-full h-[100dvh] min-h-0 bg-[#0a0a0a] relative overflow-hidden">
        <BrandedLoadingScreen
          isLoaded={sceneReady}
          progress={progress}
          status={status}
        />
        <div className="absolute inset-0">{stageTree}</div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] flex flex-col">
      <BrandedLoadingScreen
        isLoaded={sceneReady}
        progress={progress}
        status={status}
      />

      <div className="h-9 shrink-0 bg-[#111] border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-white/25 hover:text-white/55 text-[10px] transition-colors flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 12H5M12 5l-7 7 7 7"
              />
            </svg>
            Admin
          </button>
          <span className="text-white/10 text-[10px]">/</span>
          <span className="text-white/30 text-[10px] font-mono truncate max-w-[200px]">
            {project?.name ?? slug}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!project?.embed_enabled && (
            <span className="text-amber-400/60 text-[10px] px-2 py-0.5 rounded bg-amber-400/5 border border-amber-400/15">
              Embed not enabled for this project
            </span>
          )}
          <span
            className="text-[10px] px-2 py-0.5 rounded border text-white/20 border-white/10"
            style={{ fontFamily: "'Chakra Petch', sans-serif", letterSpacing: '0.1em' }}
          >
            EMBED PREVIEW
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0">
        <div
          className="flex-1 relative min-h-[50vh] lg:min-h-0 border-b lg:border-b-0 border-white/5"
          style={{ minHeight: 'min(70vh, calc(100vh - 36px))' }}
        >
          {stageTree}
        </div>

        <div className="w-full lg:w-72 bg-[#111] border-t lg:border-t-0 lg:border-l border-white/5 p-4 space-y-4 shrink-0">
          <div className="space-y-1">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Project</p>
            <p className="text-white/70 text-sm font-medium truncate">
              {project?.name ?? 'Untitled'}
            </p>
            <p className="text-white/20 text-[10px] font-mono break-all">{project?.id ?? ''}</p>
            <p className="text-white/15 text-[9px] font-mono break-all">
              embed_token: {slug ?? '...'}
            </p>
          </div>

          <div className="border-t border-white/5 pt-3 space-y-2">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Embed Code</p>
            <pre className="text-[9px] text-white/35 bg-black/30 border border-white/8 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
              {`<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="500"\n  frameborder="0"\n  allow="fullscreen"\n></iframe>`}
            </pre>
            <button
              type="button"
              onClick={copyEmbedCode}
              className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/8 border border-white/10 text-white/40 hover:text-white/65 text-xs transition-all"
            >
              {copied ? 'Copied!' : 'Copy embed code'}
            </button>
          </div>

          {!project?.embed_enabled && (
            <div className="border-t border-white/5 pt-3">
              <p className="text-amber-400/50 text-[10px] leading-relaxed">
                Enable embed in Admin → Publish to make this project embeddable.
              </p>
            </div>
          )}

          <div className="border-t border-white/5 pt-3">
            <p className="text-[10px] text-white/15 leading-relaxed">
              P9: Public URL uses opaque embed_token. Anonymous visitors see the stage only (no
              chrome).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

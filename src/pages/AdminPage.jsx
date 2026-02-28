import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import StageCanvas from '../components/StageCanvas'
import UIPanel     from '../components/UIPanel'
import TopBar      from '../components/TopBar'
import ProjectsDashboard from '../components/ProjectsDashboard'
import { supabase } from '../lib/supabaseClient'

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
  const [customHdriUrl, setCustomHdriUrl] = useState(null)
  const [envIntensity,       setEnvIntensity]       = useState(1)
  const [bgBlur,             setBgBlur]             = useState(0)
  const [showHdriBackground, setShowHdriBackground] = useState(false)
  const [bloomStrength,      setBloomStrength]      = useState(0.3)

  // ── Visual integrity — bloom threshold, LED color protection ─────────────
  const [bloomThreshold, setBloomThreshold] = useState(1.2)
  const [protectLed,     setProtectLed]     = useState(true)

  // ── Dashboard ────────────────────────────────────────────────────────────
  const [isDashboardOpen, setIsDashboardOpen] = useState(false)

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localBlobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u) } catch (_) {} })
      if (stageUrl && stageUrl.startsWith('blob:')) { try { URL.revokeObjectURL(stageUrl) } catch (_) {} }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    }
  }, [])

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

  const handlePlay       = useCallback(() => { videoRef.current?.play().catch(console.error); setIsPlaying(true)  }, [])
  const handlePause      = useCallback(() => { videoRef.current?.pause(); setIsPlaying(false) }, [])
  const handleToggleLoop = useCallback(() => {
    if (videoRef.current) { videoRef.current.loop = !videoRef.current.loop; setIsLooping(videoRef.current.loop) }
  }, [])

  // ── Custom HDRI upload (blob preview; uploaded to Supabase on publish) ───
  const handleCustomHdriUpload = useCallback((file) => {
    if (!file) return
    // Revoke previous blob URL if any
    if (customHdriUrl && customHdriUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(customHdriUrl) } catch (_) {}
    }
    const url = URL.createObjectURL(file)
    setHdriFile(file)
    setCustomHdriUrl(url)
    setHdriPreset('none') // custom overrides preset
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

    // Restore scene_config if present
    const cfg = project.scene_config
    if (cfg) {
      setHdriPreset(cfg.hdriPreset      ?? 'none')
      setCustomHdriUrl(cfg.customHdriUrl   ?? null)
      setEnvIntensity(cfg.envIntensity          ?? 1)
      setBgBlur(cfg.bgBlur                    ?? 0)
      setShowHdriBackground(cfg.showHdriBackground ?? false)
      setBloomStrength(cfg.bloomStrength        ?? 0.3)
      setBloomThreshold(cfg.bloomThreshold ?? 1.2)
      setProtectLed(cfg.protectLed        ?? true)
      setHdriFile(null)
    }

    if (project.video_url) {
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

    // Block publish if name is empty — prevents accumulating "Untitled Project" rows
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

      // 2. Resolve video URL — upload file OR use external/cloud URL directly
      let finalVideoUrl = null
      const activeClip  = videoPlaylist.find(c => c.id === activeVideoId)
      if (activeClip) {
        if (activeClip.external || !activeClip.file) {
          // External CDN / already-cloud URL — no upload needed
          finalVideoUrl = activeClip.url
        } else if (activeClip.file) {
          const ext       = activeClip.file.name.split('.').pop() || 'mp4'
          const videoPath = `${projectId}/video.${ext}`
          const { error: vidErr } = await supabase.storage.from('projects').upload(videoPath, activeClip.file, { upsert: true })
          if (vidErr) throw new Error(`Video upload failed: ${vidErr.message}`)
          const { data: vidPublic } = supabase.storage.from('projects').getPublicUrl(videoPath)
          finalVideoUrl = vidPublic.publicUrl
        }
      }

      // 3. Upload custom HDRI file if a new one was chosen locally
      let finalHdriUrl = customHdriUrl && !customHdriUrl.startsWith('blob:') ? customHdriUrl : null
      if (hdriFile) {
        const ext      = hdriFile.name.split('.').pop() || 'hdr'
        const hdriPath = `${projectId}/environment.${ext}`
        const { error: hdriErr } = await supabase.storage.from('projects').upload(hdriPath, hdriFile, { upsert: true })
        if (hdriErr) throw new Error(`HDRI upload failed: ${hdriErr.message}`)
        const { data: hdriPublic } = supabase.storage.from('projects').getPublicUrl(hdriPath)
        finalHdriUrl = hdriPublic.publicUrl
        // Swap blob URL → permanent cloud URL
        setCustomHdriUrl(finalHdriUrl)
        setHdriFile(null)
      }

      // 4. Build scene_config snapshot
      // NOTE: Requires a `scene_config` JSONB column in your Supabase `projects` table.
      // Run in Supabase SQL editor: ALTER TABLE projects ADD COLUMN IF NOT EXISTS scene_config jsonb;
      const az = (sunAzimuth   * Math.PI) / 180
      const el = (sunElevation * Math.PI) / 180
      const d  = 15
      const scene_config = {
        floorReflection: true,
        hdriPreset:      hdriPreset,
        customHdriUrl:   finalHdriUrl,
        envIntensity:        envIntensity,
        bgBlur:              bgBlur,
        showHdriBackground:  showHdriBackground,
        bloomStrength:       bloomStrength,
        sunPosition:     [d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az)],
        bloomThreshold:  bloomThreshold,
        protectLed:      protectLed,
      }

      // 5. Upsert project record
      const record = {
        id:              projectId,
        stage_url:       finalStageUrl,
        video_url:       finalVideoUrl,
        camera_presets:  cameraPresets,
        grid_cell_size:  gridCellSize,
        name:            projectName || 'Untitled Project',
        scene_config,
      }

      const { error: dbErr } = await supabase.from('projects').upsert(record)
      if (dbErr) throw new Error(`Database save failed: ${dbErr.message}`)

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
      hdriFile, hdriPreset, customHdriUrl, envIntensity, bgBlur, bloomStrength, sunAzimuth, sunElevation,
      bloomThreshold, protectLed])

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
          onClearPlaylist={handleClearPlaylist}
          isPlaying={isPlaying}
          isLooping={isLooping}
          onPlay={handlePlay}
          onPause={handlePause}
          onToggleLoop={handleToggleLoop}
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
          onCustomHdriUpload={handleCustomHdriUpload}
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
